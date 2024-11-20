const
  { Colors } = require('discord.js'),
  { sanitize } = require('express-xss-sanitizer'),
  {
    HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN, HTTP_STATUS_CONFLICT,
    HTTP_STATUS_SERVICE_UNAVAILABLE
  } = require('node:http2').constants,
  DAYS_IN_WEEK = 7;

module.exports = class VoteSystem {
  /**
   * @param {import('discord.js').Client<true>}client
   * @param {import('@mephisto5558/mongoose-db').DB}db
   * @param {import('..').VoteSystemConfig}config
   * @param {import('..').VoteSystemSettings}settings*/
  constructor(client, db, config = {}, settings = {}) {
    this.client = client;
    this.db = db;
    this.config = config;
    /* eslint-disable custom/sonar-no-magic-numbers -- default values*/
    this.settings = {
      requireTitle: true,
      minTitleLength: 0,
      maxTitleLength: 140,
      requireBody: false,
      minBodyLength: 0,
      maxBodyLength: 4000,
      maxPendingFeatureRequests: 5,
      webhookMaxVisibleBodyLength: 2000,
      ...settings
    };
    /* eslint-enable custom/sonar-no-magic-numbers */

    if (!client.isReady()) throw new Error('Client must be ready!');
  }

  /** @type {import('..').VoteSystem['fetchAll']} */
  fetchAll = () => Object.values(this.db.get('website', 'requests') ?? {});

  /** @type {import('..').VoteSystem['get']} */
  get = id => this.db.get('website', `requests.${id}`);

  /**
   * @typedef {import('..').FeatureRequest}FeatureRequest
   * @param {FeatureRequest['id']}id
   * @param {FeatureRequest}data
   * @returns {Promise<FeatureRequest | void>}*/
  #update = async (id, data) => this.db.update('website', `requests.${id}`, data);

  /** @type {import('..').VoteSystem['getMany']} */
  getMany = (amount, offset = 0, filter = '', includePending = false, userId = '') => {
    const cards = this.fetchAll().filter(e => ((includePending && this.config.ownerIds.includes(userId)) || !e.pending)
      && (e.title.includes(filter) || e.body.includes(filter) || e.id.includes(filter)));

    return { cards: amount ? cards.slice(offset, offset + amount) : cards.slice(offset), moreAvailable: !!(amount && cards.length > offset + amount) };
  };

  /** @type {import('..').VoteSystem['add']} */
  async add(title, body, userId) {
    const error = this.validate(userId);
    if (error) return error;

    title = sanitize(title.trim());
    body = sanitize(body.trim());

    const err = this.constructor.validateContent(this.settings, title, body);
    if (err) return err;

    const featureRequestAutoApprove = this.db.get('userSettings', `${userId}.featureRequestAutoApprove`);
    if (!featureRequestAutoApprove && Object.keys(this.db.cache.filter((_, k) => k.split('_') == userId)).length >= this.settings.maxPendingFeatureRequests)
      return { errorCode: HTTP_STATUS_FORBIDDEN, error: `You may only have up to ${this.settings.maxPendingFeatureRequests} pending feature requests` };

    const id = `${userId}_${Date.now()}`;

    await this.#update(id, { id, title, body, ...featureRequestAutoApprove ? {} : { pending: true } });

    if (featureRequestAutoApprove) {
      await this.sendToWebhook(
        'New Approved Feature Request',
        this.constructor.formatDesc({ title, body }, this.settings.webhookMaxVisibleBodyLength), Colors.Blue, `?q=${id}`
      );
    }
    else await this.sendToWebhook('New Pending Feature Request', undefined, Colors.Blue, `?q=${id}`);

    return { title, body, id, approved: featureRequestAutoApprove };
  }

  /** @type {import('..').VoteSystem['approve']} */
  async approve(featureId, userId) {
    const error = this.validate(userId, true);
    if (error) return error;

    /** @type {FeatureRequest}*/
    const featureReq = this.get(featureId);
    if (!featureReq.pending) return { errorCode: HTTP_STATUS_CONFLICT, error: 'This feature request is already approved.' };

    featureReq.votes ??= 0;
    delete featureReq.pending;

    await this.#update(featureId, featureReq);

    await this.sendToWebhook('New Approved Feature Request', this.constructor.formatDesc(featureReq, this.settings.webhookMaxVisibleBodyLength), Colors.Blue, `?q=${featureId}`);
    return featureReq;
  }

  /** @type {import('..').VoteSystem['update']} */
  async update(features, userId) {
    const error = this.validate(userId, true);
    if (error) return error;

    if (!Array.isArray(features)) features = [features];

    const
      promiseList = [],
      errorList = [];

    for (const { id, title: oTitle, body, pending } of features) {
      if (!this.get(id)) {
        errorList.push({ id, error: 'Unknown feature request ID.' });
        break;
      }

      const title = sanitize(oTitle.trim());
      const err = this.constructor.validateContent(this.settings, title, body.trim());
      if (err) {
        errorList.push({ id, error: err.error });
        break;
      }

      const data = { ...this.get(id), title, body: sanitize(body.trim()) };
      if (pending !== undefined) data.pending = pending;

      promiseList.push(this.db.update('website', `requests.${id}`, data));
    }

    await Promise.allSettled(promiseList);

    await this.sendToWebhook(
      'Feature Requests have been edited',
      'The following feature request(s) have been edited by a dev:\n'
      + features.reduce((acc, { id }) => errorList.some(e => e.id == id) ? acc : `${acc}\n- [${id}](${this.config.domain}/vote?q=${id})`, ''),
      Colors.Orange
    );

    return errorList.length ? { code: HTTP_STATUS_BAD_REQUEST, errors: errorList } : { success: true };
  }

  /** @type {import('..').VoteSystem['delete']} */
  async delete(featureId, userId) {
    const requestAuthor = featureId.split('_')[0];

    const error = this.validate(userId, requestAuthor, featureId);
    if (error) return error;

    /** @type {FeatureRequest}*/
    const featureReq = this.get(featureId);

    await this.db.delete('website', `requests.${featureId}`);
    await this.sendToWebhook(
      `Feature Request has been ${featureReq.pending ? 'denied' : 'deleted'} by ${requestAuthor == userId ? 'the author' : 'a dev'}`,
      this.constructor.formatDesc(featureReq, this.settings.webhookMaxVisibleBodyLength), Colors.Red
    );

    return { success: true };
  }

  /** @type {import('..').VoteSystem['addVote']} */
  async addVote(featureId, userId, type = 'up') {
    const error = this.validate(userId, featureId);
    if (error) return error;
    if (!['up', 'down'].includes(type)) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Invalid vote type. Use "up" or "down"' };

    const { lastVoted } = this.db.get('userSettings', userId) ?? {};
    if (this.constructor.isInCurrentWeek(lastVoted)) return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You can only vote once per week.' };

    /** @type {FeatureRequest}*/
    const featureReq = this.get(featureId);
    featureReq.votes = (featureReq.votes ?? 0) + (type == 'up' ? 1 : -1);

    await this.db.update('website', `requests.${featureId}.votes`, featureReq.votes);
    await this.db.update('userSettings', `${userId}.lastVoted`, new Date());

    await this.sendToWebhook(`Feature Request has been ${type} voted`, featureReq.title + `\n\nVotes: ${featureReq.votes} `, Colors.Blurple, `?q=${featureId} `);
    return featureReq;
  }

  /** @type {import('..').VoteSystem['sendToWebhook']} */
  async sendToWebhook(title, description, color = Colors.White, url = '') {
    if (!this.config.webhookUrl) return { errorCode: HTTP_STATUS_SERVICE_UNAVAILABLE, error: 'The backend has no webhook url configured' };

    let websiteUrl = this.config.domain;
    if (this.config.port != undefined) websiteUrl += `:${this.config.port}`;

    const res = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Teufelsbot Feature Requests',
        /* eslint-disable-next-line camelcase */
        avatar_url: `${websiteUrl}/favicon.ico`,
        embeds: [{ url: `${websiteUrl}/vote${url}`, title, description, color }]
      })
    });

    return { success: res.ok };
  }

  /** @type {import('..').VoteSystem['validate']} */
  validate(userId, requireBeingOwner, featureId) {
    if (!userId) return { errorCode: HTTP_STATUS_UNAUTHORIZED, error: 'User ID is missing.' };
    if (this.db.get('botSettings', 'blacklist')?.includes(userId)) return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You have been blacklisted from using the bot.' };
    if (!(requireBeingOwner === userId || this.config.ownerIds.includes(userId)))
      return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You do not have permission to perform this action.' };

    /* eslint-disable-next-line prefer-rest-params -- only proper way to check if the param was given, independent of its type.*/
    if (1 in arguments) {
      if (!featureId) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Feature ID is missing.' };
      if (!this.get(featureId)) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Unknown featureReq ID.' };
    }
  }

  /** @type {typeof import('..').VoteSystem['validateContent']} */
  static validateContent(settings, title, body) {
    let err;
    if (settings.requireTitle && !title) err = '"title" is required.';
    else if (settings.requireBody && !body) err = '"body" is required.';
    else if (title.length > settings.maxTitleLength) err = `"title" may not be longer than ${settings.maxTitleLength} characters.`;
    else if (title.length < settings.minTitleLength) err = `"title" may not be shorter than ${settings.minTitleLength} characters.`;
    else if (body.length > settings.maxBodyLength) err = `"body" may not be longer than ${settings.maxBodyLength} characters.`;
    else if (body.length < settings.minBodyLength) err = `"body" may not be shorter than ${settings.minBodyLength} characters.`;

    if (err) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: err };
  }

  /** @type {typeof import('..').VoteSystem['formatDesc']} */
  static formatDesc({ title = '', body = '' }, maxVisibleBodyLength) { return `**${title}**\n\n${body.length > maxVisibleBodyLength ? body.slice(maxVisibleBodyLength ?? 0) + '...' : body}`; }

  /** @type {typeof import('..').VoteSystem['isInCurrentWeek']} */
  static isInCurrentWeek(date) {
    if (date == 0) return false;
    if (date instanceof Number) date = new Date(date);

    const
      today = new Date(),
      firstDayOfWeek = new Date();
    firstDayOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -DAYS_IN_WEEK + 1 : 1));

    const nextWeek = new Date(firstDayOfWeek);
    nextWeek.setDate(firstDayOfWeek.getDate() + DAYS_IN_WEEK);

    return date >= firstDayOfWeek && date < nextWeek;
  }
};