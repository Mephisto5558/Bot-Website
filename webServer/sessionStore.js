const { MemoryStore } = require('express-session');

module.exports = class MongoStore extends MemoryStore {
  db;

  /**
   * @param {ConstructorParameters<typeof import('.').MongoStore>[0]} db
   * @param {ConstructorParameters<typeof MemoryStore>} rest */
  constructor(db, ...rest) {
    super(...rest);

    this.db = db;
  }

  /** @type {import('.').MongoStore['get']} */
  async get(sid, cb) {
    /** @type {null | import('.').session & { passport?: Record<string, unknown> }} */
    const data = await this.db.get('website', `sessions.${sid}`);

    if (data && 'user' in data) {
      if ('passport' in data) data.passport.user = data.user;
      else data.passport = { user: data.user };
    }

    return cb(null, data); /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }

  /** @type {import('.').MongoStore['set']} */
  async set(sid, sessionData, cb) {
    if (sessionData.passport && 'user' in sessionData.passport) {
      sessionData.user = sessionData.passport.user;

      delete sessionData.passport.user;
      if (!Object.keys(sessionData.passport).length) delete sessionData.passport;
    }

    await this.db.update('website', `sessions.${sid}`, sessionData);
    return cb?.(null); /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }

  /** @type {import('.').MongoStore['destroy']} */
  async destroy(sid, cb) {
    await this.db.delete('website', `sessions.${sid}`);
    return cb?.(null); /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }
};