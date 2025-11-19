import type { Client } from 'discord.js';
import type { PathLike } from 'node:fs';
import type { DB, NoCacheDB } from '@mephisto5558/mongoose-db';
import type SoftUITheme from 'dbd-soft-ui';
import type { Express, Handler, NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { MemoryStore } from 'express-session';
import type { Authenticator } from 'passport';
import type { Profile } from 'passport-discord-auth';
import type { customPage } from '..';
import type { Database, sessionId } from '../database.ts';

// Source: https://github.com/microsoft/TypeScript/issues/54451#issue-1732749888
type Omit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] };


export type session = NonNullable<Database['website']['sessions'][sessionId]>;

type originalDashboardOptions = ConstructorParameters<Dashboard>[0];
type DashboardThemeOptions = Parameters<typeof SoftUITheme>[0];

type DashboardOptions = {
  errorPagesDir?: string;

  /** HTML code for the 404 page */
  html404?: string;

  client?: originalDashboardOptions['client'];
  invite?: originalDashboardOptions['invite'];
  theme?: originalDashboardOptions['theme'];
} & Omit<originalDashboardOptions, 'client' | 'invite' | 'theme'>;


export declare class MongoStore extends MemoryStore {
  db: DB<Database> | NoCacheDB<Database>;

  constructor(db: MongoStore['db']);

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

export declare class WebServerSetupper {
  client: Client<true>;
  db: DB<Database>;
  authenticator: Awaited<ReturnType<WebServerSetupper['setupAuth']>>;
  authUrl?: string;
  callbackUrl: string;
  dashboardTheme: Awaited<ReturnType<WebServerSetupper['setupDashboardTheme']>>;
  dashboard: Awaited<ReturnType<WebServerSetupper['setupDashboard']>>;
  router: Awaited<ReturnType<WebServerSetupper['setupRouter']>>;

  constructor(
    client: Client<true>,
    db: DB<Database>,
    baseConfig: {
      clientSecret: string;
      baseUrl: string;
      defaultAPIVersion: number;
    }
  );

  /** @default authUrl = '/auth/discord', callbackUrl = '/auth/discord/callback' */
  setupAuth(authUrl?: string, callbackUrl?: string): Authenticator<Handler, RequestHandler>;

  setupDashboardTheme(config: DashboardThemeOptions): ReturnType<typeof SoftUITheme>;

  setupDashboard(licenseId: string, config: DashboardOptions): Promise<Dashboard>;

  setupRouter(customPagesPath?: string): Router;

  setupApp(
    secret: string, sessionStore?: Express.SessionStore, handlers?: Handler[],
    config?: { domain?: string; baseUrl?: string; errorPagesDir?: string }
  ): Express;

  static createNavigationButtons(dirPath: PathLike, reqPath: string): Promise<string | undefined>;

  static runParsed<REQ extends Request, RES extends Response, PAGE extends customPage>(
    req: REQ, res: RES, next: NextFunction, data: PAGE,
    fn: (req: REQ, res: RES, data: PAGE) => void
  ): void;
}