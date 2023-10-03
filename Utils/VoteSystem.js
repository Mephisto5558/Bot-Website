import { Collection, Colors } from 'discord.js';
import { sanitize } from 'express-xss-sanitizer';
import { readFile } from 'fs/promises';

const { devIds } = JSON.parse(await readFile('./config.json', 'utf-8').catch(() => '{}')) || {};

export default class VoteSystem {
  /**@param {import('./db.js').default}db Database @param {string}domain Website Domain @param {string}webhookURL Webhook URL*/
  constructor(db, domain, webhookURL) {
    if (!db?.set) throw new Error('Missing DB#set method');
    this.db = db;
    this.domain = domain;
    this.webhookURL = webhookURL
  }

  /**@type {Collection<string,{id:String,title:String,body:String,votes:Number,pending?:true}>}*/
  cache = new Collection();

  /**Initializes the class (fetching data to cache)*/
  async init() {
    await this.fetchAll();
    return this;
  }

  /** @returns {Promise<{id:string,title:string,body:string,votes:number,pending?:true}[]>} Overwrites the cache*/
  async fetchAll() {
    const data = Object.entries((await this.db.get('website', 'requests')) ?? {});

    for (const [k, v] of data) v.id = k;
    this.cache = new Collection(data);

    return data;
  }

  get = id => this.cache.get(id);
  getMany = (amount, offset = 0, filter = '', includePending = false, userId = '') => {
    const cards = [...this.cache.values()].filter(e => ((includePending && devIds.includes(userId)) || !e.pending) && (e.title.includes(filter) || e.body?.includes(filter) || e.id.includes(filter)));
    return { cards: amount ? cards.slice(offset, offset + amount) : cards.slice(offset), moreAvailable: !!(amount && cards.length > offset + amount) };
  };

  async add(title, body, userId = '') {
    if (!userId) return { errorCode: 401, error: 'User ID is missing.' };
    if (!title) return { errorCode: 400, error: 'Missing title.' };

    title = sanitize(title.trim());
    body = sanitize(body?.trim());

    if (title.length > 140 || body?.length > 4000) return { errorCode: 400, error: 'title can only be 140 chars long, body can only be 4000 chars long.' };

    const featureRequestAutoApprove = await this.db.get('userSettings', `${userId}.featureRequestAutoApprove`);
    if (!featureRequestAutoApprove && Object.keys(this.cache.filter((_, k) => k.split('_') == userId))?.length >= 5) return { errorCode: 403, error: 'You can only have up to 5 pending feature requests' };

    const id = `${userId}_${Date.now()}`;

    await this.db.update('website', `requests.${id}`, { title, body, ...(featureRequestAutoApprove ? {} : { pending: true }) });
    this.cache.set(id, { title, body, id, ...(featureRequestAutoApprove ? {} : { pending: true }) });

    if (featureRequestAutoApprove) await this.sendToWebhook(`[New Pending Feature Request](${this.domain}}#${id})`, null, Colors.Blue);
    else await this.sendToWebhook(`[New Approved Feature Request](${this.domain}#${id})`, this.constructor.formatDesc(request), Colors.Blue);

    return { title, body, id, approved: featureRequestAutoApprove };
  }

  async approve(featureId, userId) {
    if (!devIds?.includes(userId)) return { errorCode: 403, error: 'You don\'t have permission to approve feature requests.' };
    const request = this.cache.get(featureId);
    if (!request) return { errorCode: 400, error: 'Unknown feature ID.' };
    if (!request.pending) return { errorCode: 409, error: 'This feature is already approved.' };

    request.votes ??= 0;
    delete request.pending;

    await this.db.update('website', `requests.${featureId}`, request);
    this.cache.set(featureId, request);

    await this.sendToWebhook(`[New Approved Feature Request](${this.domain}#${featureId})`, this.constructor.formatDesc(request), Colors.Blue);

    return request;
  }

  async update(features, userId) {
    if (!devIds?.includes(userId)) return { errorCode: 403, error: 'You don\'t have permission to update feature requests.' };
    features = Array.isArray(features) ? features : [features];

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

      const data = { ...this.cache.get(id), title, body: sanitize(body?.trim()) };
      delete data.id;
      promiseList.push(this.db.update('website', `requests.${id}`, data));

      data.id = id;
      this.cache.set(id, data);
    }

    await Promise.allSettled(promiseList);

    await this.sendToWebhook(
      `[Feature Requests have been edited](${this.domain})`,
      'The following feature request(s) have been edited by a dev:\n\n' + features.reduce((acc, { id }) => errorList.find(e => e.id == id) ? acc : `${acc}\n[${id}](${this.domain}#${id})`, ''),
      Colors.Orange
    );

    return errorList.length ? { code: 400, errors: errorList } : { success: true };
  };

  async delete(featureId, userId) {
    if (!devIds?.includes(userId)) return { errorCode: 403, error: 'You don\'t have permission to delete feature requests.' };

    const request = this.get(featureId);
    if (!request) return { errorCode: 400, error: 'Unknown feature ID.' };

    await this.db.delete('website', `requests.${featureId}`);
    this.cache.delete(featureId);

    await this.sendToWebhook(`[Feature Request has been ${req.pendig ? 'denied' : 'deleted'}](${this.domain})`, this.constructor.formatDesc(request), Colors.Red);

    return { success: true };
  }

  /** @param {string}featureId @param {string}userId @param {'up'|'down'}type @returns {{errorCode:number,error:string}|{feature:string,votes:number}}*/
  async addVote(featureId, userId, type = 'up') {
    if (!userId) return { errorCode: 400, error: 'User ID is missing.' };
    if (type != 'up' && type != 'down') return { errorCode: 400, error: 'Invalid vote type. Use "up" or "down"' };

    const { lastVoted } = (await this.db.get('userSettings', userId)) || {};
    if (this.constructor.isInCurrentWeek(new Date(lastVoted))) return { errorCode: 403, error: 'You can only vote once per week.' };

    const feature = this.get(featureId);
    if (!feature) return { errorCode: 400, error: 'Unknown feature ID.' };

    const vote = type == 'up' ? 1 : -1;
    feature.votes = feature.votes + vote || vote;
    this.cache.set(featureId, feature);
    await this.db.update('website', `requests.${featureId}.votes`, feature.votes);
    await this.db.update('userSettings', `${userId}.lastVoted`, new Date().getTime());

    await this.sendToWebhook(`[Feature Request has been ${type}voted](${this.domain}#${featureId})`, feature.title + `\n\nVotes: ${feature.votes}`, Colors.Blurple);

    return { feature: featureId, votes: feature.votes };
  }

  async sendToWebhook(title, description, color = Colors.White) {
    if (!this.webhookURL) return { errorCode: 500, error: 'The backend has no webhook url configured' };

    const res = await fetch(this.webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Teufelsbot Feature Requests',
        avatar_url: this.domain ? `${this.domain}/favicon.ico` : null,
        embeds: [{ title, description, color }]
      })
    });

    return { success: res.ok };
  }

  static formatDesc({ title = '', body = '' }) { return `${title}\n\n${body.length > 2000 ? body.substring(2000) + '...' : body}`; }

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
}