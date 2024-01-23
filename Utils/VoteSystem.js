const
  { Colors } = require('discord.js'),
  { sanitize } = require('express-xss-sanitizer');

module.exports = class VoteSystem {
  /**@param {import('discord.js').Client}client*/
  constructor(client, db, domain, webhookURL) {
    this.client = client;
    this.db = db;
    this.domain = domain;
    this.webhookURL = webhookURL;

    if (!client.isReady()) throw new Error('Client must be ready!');
  }

  fetchAll = () => Object.entries(this.db.get('website', 'requests') ?? {});
  get = id => this.db.get('website', 'requests' + (id ? `.${id}` : ''));
  #update = (id, data) => this.db.update('website', `requests.${id}`, data);

  getMany = (amount, offset = 0, filter = '', includePending = false, userId = '') => {
    const cards = Object.values(this.get()).filter(e => ((includePending && this.client.application.owner.id == userId) || !e.pending) && (e.title.includes(filter) || e.body?.includes(filter) || e.id.includes(filter)));
    return { cards: amount ? cards.slice(offset, offset + amount) : cards.slice(offset), moreAvailable: !!(amount && cards.length > offset + amount) };
  };

  async add(title, body, userId = '') {
    const error = await this.validate(userId);
    if (error) return error;
    if (!title) return { errorCode: 400, error: 'Missing title.' };

    title = sanitize(title.trim());
    body = sanitize(body?.trim());

    if (title.length > 140 || body?.length > 4000)
      return { errorCode: 400, error: 'title can only be 140 chars long, body can only be 4000 chars long.' };

    const featureRequestAutoApprove = this.db.get('userSettings', `${userId}.featureRequestAutoApprove`);
    if (!featureRequestAutoApprove && Object.keys(this.db.cache.filter((_, k) => k.split('_') == userId))?.length >= 5)
      return { errorCode: 403, error: 'You can only have up to 5 pending feature requests' };

    const id = `${userId}_${Date.now()}`;

    await this.#update(id, { id, title, body, ...(featureRequestAutoApprove ? {} : { pending: true }) });

    if (featureRequestAutoApprove) await this.sendToWebhook('New Approved Feature Request', this.constructor.formatDesc({ title, body }), Colors.Blue, `?q=${id}`);
    else await this.sendToWebhook('New Pending Feature Request', null, Colors.Blue, `?q=${id}`);

    return { title, body, id, approved: featureRequestAutoApprove };
  }

  async approve(featureId, userId) {
    if (this.client.application.owner.id != userId)
      return { errorCode: 403, error: "You don't have permission to approve feature requests." };

    const request = this.get(featureId);
    if (!request) return { errorCode: 400, error: 'Unknown feature ID.' };
    if (!request.pending) return { errorCode: 409, error: 'This feature is already approved.' };

    request.votes ??= 0;
    delete request.pending;

    await this.#update(featureId, request);

    await this.sendToWebhook('New Approved Feature Request', this.constructor.formatDesc(request), Colors.Blue, `?q=${featureId}`);
    return request;
  }

  async update(features, userId) {
    if (this.client.application.owner.id != userId) return { errorCode: 403, error: 'You don\'t have permission to update feature requests.' };
    if (Array.isArray(features)) features = [features];

    const promiseList = [], errorList = [];
    for (let { id, title: oTitle, body } of features) {
      if (!this.get(id)) {
        errorList.push({ id, error: 'Unknown feature ID.' });
        break;
      }

      const title = sanitize(oTitle?.trim());
      if (!title) {
        errorList.push({ id, error: 'title must be non-empty string' });
        break;
      }

      const data = { ...this.get(id), title, body: sanitize(body?.trim()) };
      promiseList.push(this.db.update('website', `requests.${id}`, data));
    }

    await Promise.allSettled(promiseList);

    await this.sendToWebhook(
      'Feature Requests have been edited',
      'The following feature request(s) have been edited by a dev:\n' + features.reduce((acc, { id }) => errorList.some(e => e.id == id) ? acc : `${acc}\n- [${id}](${this.domain}/vote?q=${id})`, ''),
      Colors.Orange
    );

    return errorList.length ? { code: 400, errors: errorList } : { success: true };
  }

  async delete(featureId, userId) {
    const requestAuthor = featureId.split('_')[0];
    if (this.client.application.owner.id != userId && requestAuthor != userId)
      return { errorCode: 403, error: 'You don\'t have permission to delete that feature request.' };

    const request = this.get(featureId);
    if (!request) return { errorCode: 400, error: 'Unknown feature ID.' };

    await this.db.delete('website', `requests.${featureId}`);
    this.db.delete(featureId);

    await this.sendToWebhook(`Feature Request has been ${request.pending ? 'denied' : 'deleted'} by ${requestAuthor == userId ? 'the author' : 'a dev'}`, this.constructor.formatDesc(request), Colors.Red);
    return { success: true };
  }

  async addVote(featureId, userId, type = 'up') {
    const error = await this.validate(userId);
    if (error) return error;
    if (type != 'up' && type != 'down') return { errorCode: 400, error: 'Invalid vote type. Use "up" or "down"' };

    const { lastVoted } = this.db.get('userSettings', userId) || {};
    if (this.constructor.isInCurrentWeek(new Date(lastVoted))) return { errorCode: 403, error: 'You can only vote once per week.' };

    const feature = this.get(featureId);
    if (!feature) return { errorCode: 400, error: 'Unknown feature ID.' };

    const vote = type == 'up' ? 1 : -1;
    feature.votes = feature.votes + vote || vote;

    await this.db.update('website', `requests.${featureId}.votes`, feature.votes);
    await this.db.update('userSettings', `${userId}.lastVoted`, new Date().getTime());

    await this.sendToWebhook(`Feature Request has been ${type} voted`, feature.title + `\n\nVotes: ${feature.votes} `, Colors.Blurple, `?q=${featureId} `);
    return feature;
  }

  async sendToWebhook(title, description, color = Colors.White, url = '') {
    if (!this.webhookURL) return { errorCode: 500, error: 'The backend has no webhook url configured' };

    const res = await fetch(this.webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Teufelsbot Feature Requests',
        avatar_url: this.domain ? `${this.domain}/favicon.ico` : null,
        embeds: [{ url: `${this.domain}/vote${url ?? ''}`, title, description, color }]
      })
    });

    return { success: res.ok };
  }

  async validate(userId) {
    if (!userId) return { errorCode: 401, error: 'User ID is missing.' };
    if (this.db.get('botSettings', 'blacklist')?.includes(userId)) return { errorCode: 403, error: 'You have been blacklisted from using the bot.' };
  }

  static formatDesc({ title = '', body = '' }) { return `**${title}**\n\n${body.length > 2000 ? body.substring(2000) + '...' : body}`; }

  /**@param {Date|Number}date The date obj or the ms from `date.getTime()`*/
  static isInCurrentWeek(date) {
    if (!date) return false;
    if (date instanceof Number) date = new Date(date);

    const today = new Date(), firstDayOfWeek = new Date();
    firstDayOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

    const nextWeek = new Date(firstDayOfWeek);
    nextWeek.setDate(firstDayOfWeek.getDate() + 7);

    return date >= firstDayOfWeek && date < nextWeek;
  }
};
