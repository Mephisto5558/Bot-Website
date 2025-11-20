/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
import { MemoryStore } from 'express-session';
import type { AnyDB } from '@mephisto5558/mongoose-db';
import type { Profile } from 'passport-discord-auth';
import type { Database } from '../database.js';
import type { DBSession } from './index.js';


export default class MongoStore extends MemoryStore {
  db: AnyDB<Database>;

  constructor(db: AnyDB<Database>, ...rest: ConstructorParameters<typeof MemoryStore>) {
    super(...rest);

    this.db = db;
  }

  override async get<P extends Parameters<MemoryStore['get']>, CB extends P[1]>(
    sid: P[0], callback: CB
  ): Promise<ReturnType<CB>> {
    const data = await this.db.get('website', `sessions.${sid}`) as (DBSession & { passport?: Record<string, unknown> }) | undefined;

    if (data && 'user' in data) {
      if ('passport' in data) data.passport.user = data.user;
      else data.passport = { user: data.user };
    }

    return callback(null, data) as ReturnType<CB>; /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }

  override async set<P extends Parameters<MemoryStore['set']>, CB extends P[2]>(
    sid: P[0], sessionData: DBSession & { passport?: { user?: Profile } }, callback?: CB
  ): Promise<ReturnType<NonNullable<CB>>> {
    if (sessionData.passport && 'user' in sessionData.passport) {
      sessionData.user = sessionData.passport.user;

      delete sessionData.passport.user;
      if (!Object.keys(sessionData.passport).length) delete sessionData.passport;
    }

    await this.db.update('website', `sessions.${sid}`, sessionData);
    return callback?.(null) as ReturnType<NonNullable<CB>>; /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }

  override async destroy<P extends Parameters<MemoryStore['destroy']>, CB extends P[1]>(
    sid: P[0], callback?: CB
  ): Promise<ReturnType<NonNullable<CB>>> {
    await this.db.delete('website', `sessions.${sid}`);
    return callback?.(null) as ReturnType<NonNullable<CB>>; /* eslint-disable-line unicorn/no-null -- `null` must be used here */
  }
}