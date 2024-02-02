import type Discord from 'discord.js'
import type express from 'express'
import type { Dirent } from 'fs';
import type { MemoryStore } from 'express-session'
import type { PassportStatic } from 'passport';
import type { formTypes } from 'discord-dashboard'
import type { DB } from '@mephisto5558/mongoose-db';

export { WebServer, type VoteSystem, type FeatureRequest, type dashboardSetting, type customPage }
export default WebServer

type Support = { mail?: string, discord?: string }
type Keys = { secret: string, dbdLicense: string, webhookURL: string }

type RequestError = { errorCode: number; error: string; };
type FeatureRequest = {
  id: string;
  title: string;
  body: string;
  votes: number;
  pending?: true;
};
type formTypes_ = Omit<formTypes, "embedBuilder"> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder']; };

type dashboardSetting = {
  id: string,
  name: string,
  description: string,
  type: formTypes_ | keyof formTypes_ | ((this: WebServer) => formTypes_ | Promise<formTypes_>),
  position: number
};
type methods = 'get'| 'post'| 'put'| 'delete'| 'patch'
type customPage = {
  method?: methods | methods[], 
  permissionCheck?(this: express.Request): boolean | Promise<boolean>,
  title: string,
  static?: boolean,
  run?: string | number | boolean | (function(this: WebServer, express.Response, express.Request, express.NextFunction): any),
};

declare class WebServer {
  constructor(
    client: Discord.Client, db: DB, keys: Keys,
    config?: {
      support?: Support; port?: number; domain?: string; errorPagesDir?: string;
      settingsPath?: string; customPagesPath?: string;
    },
    errorLoggingFunction?: (err: Error, req: express.Request, res: express.Response) => any
  );

  client: Discord.Client<true>;
  db: DB;
  config: {
    support: Support; port: number; domain: string; errorPagesDir?: string;
    settingsPath: string, customPagesPath: string
  };
  keys: Keys;
  initiated: boolean;

  passport: PassportStatic?;
  sessionStore: MemoryStore?;
  dashboardOptionCount: any[]?;
  /**modified default settings of embedBuilder*/
  formTypes: (Omit<formTypes, "embedBuilder"> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder']; })?;
  dashboard: Dashboard?;
  router: express.Router?;
  app: express.Express?;
  voteSystem: VoteSystem?;

  init(commands: object[]): Promise<this>;

  #checkConstructorParams(): undefined;
  #setupPassport(): undefined;
  #setupSessionStore(): undefined;
  #setupDashboard(settingsPath: string, commands: object[]): Promise<undefined>
  #setupRouter(): undefined;
  #setupApp(): undefined;

  sendNavigationButtons(dir: Dirent[], path: string, reqPath: string): Promise<string | void>

  logError(err: Error, req: express.Request, res: express.Response): any;
}

declare class VoteSystem {
  constructor(client: Discord.Client<true>, db: DB, domain: string, webhookURL?: string);

  client: Discord.Client<true>;
  db: DB;
  domain: string;
  webhookURL: string;

  fetchAll(): Promise<FeatureRequest[]>;
  get(id: FeatureRequest['id']): Promise<FeatureRequest | void>;
  #update(id: FeatureRequest['id'], data: FeatureRequest): Promise<FeatureRequest | void>
  getMany(amount: number, offset?: number, filter?: string, includePendig?: boolean, userId?: Discord.Snowflake): { cards: FeatureRequest[]; moreAvailable: boolean; }
  add(title: string, body: string, userId?: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  approve(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  update(features: FeatureRequest[], userId: Discord.Snowflake): Promise<{ success: true } | { code: 400, errors: { id: FeatureRequest['id'], error: string }[] }>;
  delete(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<{ success: true } | RequestError>;
  addVote(featureId: FeatureRequest['id'], userId: Discord.Snowflake, type: 'up' | 'down'): Promise<FeatureRequest | RequestError>;
  sendToWebhook(title: string, description: string, color?: number, url?: string): Promise<{ success: boolean } | RequestError>;
  validate(userId: Discord.Snowflake): Promise<RequestError | void>;

  static formatDesc(params: { title?: string, body?: string }): string
  
  /**@param date A date obj or millseconds*/
  static isInCurrentWeek(date: Date | Number): boolean
}