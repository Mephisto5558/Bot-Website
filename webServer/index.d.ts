import type { MemoryStore } from 'express-session';
import type { default as DB, NoCacheDB } from '@mephisto5558/mongoose-db';
import type SoftUITheme from 'dbd-soft-ui';
import type { Profile } from 'passport-discord';
import type { Client } from 'discord.js';
import type { Authenticator } from 'passport';
import type { Database } from '../database';
import type { Handler, Router, Express } from 'express';

/* eslint-disable-next-line sonarjs/redundant-type-aliases -- documentation */
type sessionId = string;
export type session = NonNullable<Database['website']['sessions'][sessionId]>;

type originalDashboardOptions = ConstructorParameters<Dashboard>[0];
type originalDashboardThemeOptions = Parameters<typeof SoftUITheme>[0];

interface DashboardThemeOptions extends Omit<originalDashboardThemeOptions, 'index'> {
  index?: originalDashboardThemeOptions['index'];
}

interface DashboardOptions extends Omit<originalDashboardOptions, 'client' | 'invite' | 'theme'> {
  errorPagesDir?: string;

  /** HTML code for the 404 page */
  html404?: string;

  client?: originalDashboardOptions['client'];
  invite?: originalDashboardOptions['invite'];
  theme?: originalDashboardOptions['theme'];
}


declare class MongoStore extends MemoryStore {
  db: DB | NoCacheDB;

  constructor(db: DB | NoCacheDB);

  get<P extends Parameters<MemoryStore['get']>, CB extends P[1]>(
    sid: P[0],
    callback: CB
  ): Promise<ReturnType<CB>>;

  set<P extends Parameters<MemoryStore['set']>, CB extends P[2]>(
    sid: P[0],
    sessionData: session & { passport?: { user?: Profile } },
    callback?: CB
  ): Promise<ReturnType<NonNullable<CB>>>;

  destroy<P extends Parameters<MemoryStore['destroy']>, CB extends P[1]>(
    sid: P[0],
    callback?: CB
  ): Promise<ReturnType<NonNullable<CB>>>;
}

declare class WebServerSetupper {
  client: Client<true>;
  authenticator: Awaited<ReturnType<WebServerSetupper['setupAuth']>>;
  dashboardTheme: Awaited<ReturnType<WebServerSetupper['setupDashboardTheme']>>;
  dashboard: Awaited<ReturnType<WebServerSetupper['setupDashboard']>>;
  router: Awaited<ReturnType<WebServerSetupper['setupRouter']>>;

  constructor(
    client: Client<true>,
    baseConfig: {
      clientSecret: string;
      baseURL: string;
    }
  );

  /** @param callbackURL default `/auth/discord/callback` */
  setupAuth(callbackURL?: string): Authenticator;

  setupDashboardTheme(config: DashboardThemeOptions): ReturnType<typeof SoftUITheme>;

  setupDashboard(licenseId: string, config: DashboardOptions): Promise<Dashboard>;

  setupRouter(customPagesPath?: string): Router;

  setupApp(
    secret: string, handlers?: Handler[],
    config?: { domain?: string; baseUrl?: string }
  ): Express;
}