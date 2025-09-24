import type Discord from 'discord.js';
import type express from 'express';
import type { PathLike } from 'node:fs';
import type { MemoryStore } from 'express-session';
import type { PassportStatic } from 'passport';
import type Passport from 'passport-discord-auth';
import type { formTypes, optionOptions } from 'discord-dashboard';
import type { FormTypes } from 'dbd-soft-ui';
import type { DB as DBClass } from '@mephisto5558/mongoose-db';
import type { Database } from './database';
import type { DashboardOptions, DashboardThemeOptions } from './webServer';

export { WebServer };
export type { VoteSystem, VoteSystemConfig, VoteSystemSettings, FeatureRequest, dashboardSetting, customPage, commands, WebServerConfig };
export default WebServer;

type DB = DBClass<Database>;

type Support = { mail?: string; discord?: string };
type Keys = { secret: string; dbdLicense: string };

type RequestError = { errorCode: number; error: string };
type FeatureRequest = {
  id: `PVTI_${string}` | `${Discord.Snowflake}_${number}`;
  title: string;
  body: string;
} & (
  { votes: number; pending: undefined }
  | { votes?: number; pending: true }
);
type formTypes_ = Omit<formTypes & FormTypes, 'embedBuilder'> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder'] };

type dashboardSetting = {
  id: string;
  name: string;
  description: string;
  type: formTypes_ | keyof formTypes_ | ((this: WebServer) => formTypes_ | Promise<formTypes_>);
  position: number;

  get?(this: WebServer, option: category['categoryOptionsList'][0], setting: Omit<optionOptions, 'newData'>): unknown;
  set?(this: WebServer, option: category['categoryOptionsList'][0], setting: Omit<optionOptions, 'newData'> & { data: unknown }): unknown;
};
type methods = 'get' | 'post' | 'put' | 'delete' | 'patch';
type customPage = {
  method?: methods | methods[];
  permissionCheck?(this: express.Request): boolean | Promise<boolean>;
  title: string;
  static?: boolean;
  run?: URL | string | number | boolean | ((this: WebServer, arg1: express.Response, arg2: express.Request, arg3: express.NextFunction) => unknown);
};
type commands = { category: string; subTitle: string; aliasesDisabled: boolean; list: Record<string, unknown>[] }[];

type WebServerConfig = {
  support?: Support; port?: number; domain?: string; ownerIds?: string[];

  /**
   * ```js
   * if (port) `${WebServer['config']['domain']}:${WebServer['config']['port']}`
   * else WebServer['config']['domain']
   * ``` */
  webhookUrl?: string; callbackURL?: string; authUrl?: string; defaultAPIVersion?: number;
  errorPagesDir?: string; settingsPath?: string; customPagesPath?: string;
};
type VoteSystemSettingsInit = {
  requireTitle?: boolean; minTitleLength?: number; maxTitleLength?: number;
  requireBody?: boolean; minBodyLength?: number; maxBodyLength?: number;
  maxPendingFeatureRequests?: number; webhookMaxVisibleBodyLength?: number;
  userChangeNotificationEmbed?: Record<'approved' | 'denied' | 'deleted' | 'updated', {
    title?: string;
    description?: string;
    color?: number | Discord.ColorResolvable;
  }>;
};
type VoteSystemSettings = Required<VoteSystemSettingsInit>;

declare type HTTP_STATUS_BAD_REQUEST = 400;

declare class WebServer {
  constructor(
    client: Discord.Client, db: DB, keys: Keys,
    config?: WebServerConfig,
    errorLoggingFunction?: (err: Error, req: express.Request, res: express.Response) => unknown
  );

  client: Discord.Client<true>;
  db: DB;
  config: Required<WebServerConfig> & { baseUrl: string };

  keys: Keys;

  /** set to true once this.init() ran */
  initiated: boolean;

  passport: PassportStatic | null;
  sessionStore: MemoryStore | null;
  dashboardOptionCount: unknown[] | null;

  /** modified default settings of embedBuilder */
  formTypes: Omit<formTypes, 'embedBuilder'> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder'] } | null;
  dashboard: Dashboard | null;
  router: express.Router | null;
  app: express.Express | null;
  voteSystem: VoteSystem | null;

  init(dashboardConfig: DashboardOptions, themeConfig?: DashboardThemeOptions, voteSystemConfig?: VoteSystemConfig, voteSystemSettings?: VoteSystemSettingsInit): Promise<this>;

  logError(err: Error, req: express.Request, res: express.Response): unknown;

  valueOf(): string;

  static createNavigationButtons(dirPath: PathLike, reqPath: string): Promise<string | undefined>;

  static runParsed(
    req: express.Request, res: express.Response, next: express.NextFunction,
    /* eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents */
    data: customPage | unknown, fn: (req: express.Request, res: express.Response, data: customPage | unknown) => void
  ): void;
}

type VoteSystemConfig = { domain: string; port?: number; votingPath: string; webhookUrl?: string; ownerIds?: string[] };
declare class VoteSystem {
  /**
   * @default settings=
   * ```js
   * {
   *  requireTitle: true, minTitleLength: 0, maxTitleLength: 140,
   *  requireBody: false, minBodyLength: 0, maxBodyLength: 4000,
   *  maxPendingFeatureRequests: 5, webhookMaxVisibleBodyLength: 2000
   * }
   * ``` */
  constructor(client: Discord.Client<true>, db: DB, config: VoteSystemConfig, settings: VoteSystemSettingsInit);

  client: Discord.Client<true>;
  config: VoteSystemConfig;
  settings: VoteSystemSettings;

  fetchAll(): FeatureRequest[];
  get(id: FeatureRequest['id']): FeatureRequest | undefined;
  getMany(amount: number, offset?: number, filter?: string, includePendig?: boolean, userId?: Discord.Snowflake): { cards: FeatureRequest[]; moreAvailable: boolean };
  add(title: string, body: string, userId: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  approve(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  update(features: FeatureRequest | FeatureRequest[], userId: Discord.Snowflake): Promise<
    { success: true } | RequestError | { errorCode: HTTP_STATUS_BAD_REQUEST; errors: { id: FeatureRequest['id']; error: string }[] }
  >;
  delete(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<{ success: true } | RequestError>;
  addVote(featureId: FeatureRequest['id'], userId: Discord.Snowflake, type: 'up' | 'down'): Promise<FeatureRequest | RequestError>;
  sendToWebhook(title: string, description: string, color?: number, url?: string): Promise<{ success: boolean } | RequestError>;
  notifyAuthor(feature: FeatureRequest, mode: keyof VoteSystemSettings['userChangeNotificationEmbed']): Promise<void>;
  validate(userId: Discord.Snowflake, requireBeingOwner: boolean | Discord.Snowflake, featureId: unknown): RequestError | undefined;

  /** returns `RequestError` if something is not valid. */
  static validateContent(settings: VoteSystemSettings, title?: string, body?: string): RequestError | undefined;

  static formatDesc(params: { title?: string; body?: string }, maxVisibleBodyLength?: number): string;

  /** @param date A date obj or millseconds */
  static isInCurrentWeek(date: Date | number): boolean;

  static getRequestAuthor(request: FeatureRequest | FeatureRequest['id']): Discord.Snowflake;
}

/* eslint-disable @typescript-eslint/ban-ts-comment -- depending on the module resolution, one of these might not error out. */
declare module '../node_modules/discord.js/node_modules/discord-api-types/v10' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = `${bigint}`;
}
declare module 'discord-api-types/v10' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = `${bigint}`;
}
/* eslint-enable @typescript-eslint/ban-ts-comment */

declare module 'discord-dashboard' {
  interface optionOptions {
    guild: { id: Discord.Guild['id'] };
    user: { id: Discord.User['id'] };
    newData: unknown;
  }

  interface allowedCheckOption {
    guild: { id: Discord.Guild['id'] };
    user: { id: Discord.User['id'] };
  }
}

declare global {
  namespace Express {
    /* eslint-disable-next-line @typescript-eslint/no-empty-object-type -- needs to be an interface */
    interface User extends Passport.Profile {}
  }
}