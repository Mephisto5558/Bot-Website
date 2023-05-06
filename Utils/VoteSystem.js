import { Collection } from 'discord.js';
import { sanitize } from 'express-xss-sanitizer';

export default class VoteSystem {
  /**@param {import('./db.js').default}db Database*/
  constructor(db) {
    if (!db?.set) throw new Error('Missing DB#set method');
    this.db = db;
  }

  /**@type {Collection<string,{id:String,title:String,body:String,votes:Number}>} The cache will be updated automatically (WIP)*/
  cache = new Collection();

  /**Initializes the class (fetching data to cache)*/
  async init() {
    await this.fetchAll();
    return this;
  }

  /** @returns {Promise<{id:string,title:string,body:string,votes:number}[]>} Overwrites the cache*/
  async fetchAll() {
    const entries = Object.entries((await this.db.get('website'))?.requests ?? {});

    this.cache = new Collection(entries);
    return entries.map(([id, { title, body, votes }]) => ({ id, title, body, votes }));
  }

  get = id => this.cache.get(id);
  getMany = (amount, offset = 0, filter = '') => {
    const cards = [...this.cache.values()].filter(e => e.title.includes(filter) || e.body?.includes(filter) || e.id.includes(filter));
    return { cards: amount ? cards.slice(offset, offset + amount) : cards.slice(offset), moreAvailable: amount && cards.length > offset + amount };
  };

  async add(title, body, userId = '') {
    if (!userId) return { errorCode: 401, error: 'User ID is missing.' };
    if (!title) return { errorCode: 400, error: 'Missing title.' };

    title = sanitize(title.trim());
    body = sanitize(body?.trim());

    if (title.length > 140 || body?.length > 4000) return { errorCode: 400, error: 'title can only be 140 chars long, body can only be 4000 chars long.' };

    const { noFeatureRequestApprovement, pendingFeatureRequests } = (await this.db.get('userSettings'))?.[userId] ?? {};
    if (!noFeatureRequestApprovement && Object.keys(pendingFeatureRequests)?.length >= 5) return { errorCode: 403, error: 'You can only have up to 5 pending feature requests' };

    const id = userId + Date.now();
    if (noFeatureRequestApprovement) {
      await this.db.update('website', `requests.${id}`, { title, body });
      this.db.set(id, { title, body, votes: 0 });
    }
    else await this.db.update('website', `pendingRequests.${userId}.${id}`, { title, body });

    return { title, body, id, approved: noFeatureRequestApprovement };
  }

  async approve(userId, id) {
    const request = (await this.db.get('website'))?.pendingRequests?.[userId]?.[id];
    if (!request) return { errorCode: 400, error: 'The request has not been found for this user.' };

    request.votes ??= 0;
    await this.db.update('website', `requests.${id}`, request);
    this.db.set(id, request);

    return request;
  }

  async update(id, data) {
    await this.db.update('website', `requests.${id}`, data);
    this.cache.set(id, data);
    return this;
  };

  async delete(id) {
    await this.db.update('website', `requests.${id}`, null);
    this.cache.delete(id);
    return true;
  }

  /** @param {string}featureId @param {string}userId @param {'up'|'down'}type @returns {{errorCode:number,error:string}|{feature:string,votes:number}}*/
  async addVote(featureId, userId, type = 'up') {
    if (!userId) return { errorCode: 400, error: 'User ID is missing.' };
    if (type != 'up' && type != 'down') return { errorCode: 400, error: 'Invalid vote type. Use "up" or "down"' };

    const { lastVoted } = (await this.db.get('userSettings'))?.[userId] || {};
    if (this.constructor.isInCurrentWeek(new Date(lastVoted))) return { errorCode: 403, error: 'You can only vote once per week.' };

    const featureObj = this.get(featureId);
    if (!featureObj) return { errorCode: 400, error: 'Unknown feature ID.' };

    const vote = type == 'up' ? 1 : -1;
    featureObj.votes = featureObj.votes + vote || vote;
    this.cache.set(featureId, featureObj);
    await this.db.update('website', `requests.${featureId}.votes`, featureObj.votes);
    await this.db.update('userSettings', `${userId}.lastVoted`, new Date().getTime());
    return { feature: featureId, votes: featureObj.votes };
  }

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