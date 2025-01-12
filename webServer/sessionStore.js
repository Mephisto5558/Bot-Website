/* eslint-disable unicorn/no-null -- `null` must be used here */

const { MemoryStore } = require('express-session');

module.exports = class MongoStore extends MemoryStore {
  db;

  /**
   * @param {ConstructorParameters<typeof import('.').MongoStore>[0]}db
   * @param {ConstructorParameters<typeof MemoryStore>}rest */
  constructor(db, ...rest) {
    super(...rest);

    this.db = db;
  }

  /** @type {import('.').MongoStore['get']} */
  async get(sid, cb) {
    /** @type {null | import('.').session & {passport?: Record<string, unknown>} } */
    const data = await this.db.get('website', `sessions.${sid}`);

    if (data && 'user' in data) {
      if ('passport' in data) data.passport.user = data.user;
      else data.passport = { user: data.user };
    }

    return cb(null, data);
  }

  /** @type {import('.').MongoStore['set']} */
  async set(sid, sessionData, cb) {
    if ('user' in sessionData.passport) {
      sessionData.user = sessionData.passport.user;

      delete sessionData.passport.user;
      if (!Object.keys(sessionData.passport).length) delete sessionData.passport;
    }

    // todo doesn't this overwrite discord-dashboard data? // maybe not because it is read from db first
    await this.db.update('website', `sessions.${sid}`, sessionData);
    return cb?.(null);
  }

  /** @type {import('.').MongoStore['destroy']} */
  async destroy(sid, cb) {
    await this.db.delete('website', `sessions.${sid}`);
    return cb?.();
  }
};