import type Discord from 'discord.js';
import type express from 'express';
import type { Dirent } from 'fs';
import type { MemoryStore } from 'express-session';
import type { PassportStatic } from 'passport';
import type { formTypes } from 'discord-dashboard';
import type { DB } from '@mephisto5558/mongoose-db';

export { WebServer, type VoteSystem, type FeatureRequest, type dashboardSetting, type customPage, type commands };
export default WebServer;

type Support = { mail?: string; discord?: string };
type Keys = { secret: string; dbdLicense: string; webhookURL: string };

type RequestError = { errorCode: number; error: string };
type FeatureRequest = {
  id: string;
  title: string;
  body: string;
  votes: number;
  pending?: true;
};
type formTypes_ = Omit<formTypes, 'embedBuilder'> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder'] };

type dashboardSetting = {
  id: string;
  name: string;
  description: string;
  type: formTypes_ | keyof formTypes_ | ((this: WebServer) => formTypes_ | Promise<formTypes_>);
  position: number;
};
type methods = 'get' | 'post' | 'put' | 'delete' | 'patch';
type customPage = {
  method?: methods | methods[];
  permissionCheck?(this: express.Request): boolean | Promise<boolean>;
  title: string;
  static?: boolean;
  run?: string | number | boolean | ((this: WebServer, arg1: express.Response, arg2: express.Request, arg3: express.NextFunction) => unknown);
};
type commands = { category: string; subTitle: string; aliasesDisabled: boolean; list: Record<string, unknown>[] }[];

declare class WebServer {
  constructor(
    client: Discord.Client, db: DB, keys: Keys,
    config?: {
      support?: Support; port?: number; domain?: string; errorPagesDir?: string;
      settingsPath?: string; customPagesPath?: string;
    },
    errorLoggingFunction?: (err: Error, req: express.Request, res: express.Response) => unknown
  );

  client: Discord.Client<true>;
  db: DB;
  config: {
    support: Support; port: number; domain: string;

    /**
     * ```js
     * if (port) `${WebServer['config']['domain']}:${WebServer['config']['port']}`
     * else WebServer['config']['domain']
     * ```*/
    baseUrl: string;
    errorPagesDir?: string; settingsPath: string; customPagesPath: string;
  };

  keys: Keys;
  initiated: boolean;

  passport: PassportStatic | null;
  sessionStore: MemoryStore | null;
  dashboardOptionCount: unknown[] | null;

  /** modified default settings of embedBuilder*/
  formTypes: (Omit<formTypes, 'embedBuilder'> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder'] }) | null;
  dashboard: Dashboard | null;
  router: express.Router | null;
  app: express.Express | null;
  voteSystem: VoteSystem | null;

  init(commands: commands): Promise<this>;

  static createNavigationButtons(dir: Dirent[], path: string, reqPath: string): Promise<string | void>;

  logError(err: Error, req: express.Request, res: express.Response): unknown;
}

declare class VoteSystem {
  constructor(client: Discord.Client<true>, db: DB, domain: string, webhookURL?: string);

  client: Discord.Client<true>;
  db: DB;
  domain: string;
  webhookURL: string;

  fetchAll(): Promise<FeatureRequest[]>;
  get(id: FeatureRequest['id']): Promise<FeatureRequest | void>;
  getMany(amount: number, offset?: number, filter?: string, includePendig?: boolean, userId?: Discord.Snowflake): { cards: FeatureRequest[]; moreAvailable: boolean };
  add(title: string, body: string, userId?: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  approve(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  update(features: FeatureRequest[], userId: Discord.Snowflake): Promise<{ success: true } | { code: 400; errors: { id: FeatureRequest['id']; error: string }[] }>;
  delete(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<{ success: true } | RequestError>;
  addVote(featureId: FeatureRequest['id'], userId: Discord.Snowflake, type: 'up' | 'down'): Promise<FeatureRequest | RequestError>;
  sendToWebhook(title: string, description: string, color?: number, url?: string): Promise<{ success: boolean } | RequestError>;
  validate(userId: Discord.Snowflake): Promise<RequestError | void>;

  static formatDesc(params: { title?: string; body?: string }): string;

  /** @param date A date obj or millseconds*/
  static isInCurrentWeek(date: Date | number): boolean;
}