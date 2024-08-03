import type Discord from 'discord.js';
import type express from 'express';
import type { Dirent } from 'node:fs';
import type { MemoryStore } from 'express-session';
import type { PassportStatic } from 'passport';
import type { formTypes, Dashboard } from 'discord-dashboard';
import type { DB as DBClass } from '@mephisto5558/mongoose-db';
import type { Database } from './database';

export { WebServer };
export type { VoteSystem, FeatureRequest, dashboardSetting, customPage, commands, WebServerConfig };
export default WebServer;

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
  run?: URL | string | number | boolean | ((this: WebServer, arg1: express.Response, arg2: express.Request, arg3: express.NextFunction) => unknown);
};
type commands = { category: string; subTitle: string; aliasesDisabled: boolean; list: Record<string, unknown>[] }[];

type WebServerConfig = {
  support?: Support; port?: number; domain?: string; ownerIds?: string[];

  /**
   * ```js
   * if (port) `${WebServer['config']['domain']}:${WebServer['config']['port']}`
   * else WebServer['config']['domain']
   * ```*/
  webhookUrl?: string;
  errorPagesDir?: string; settingsPath?: string; customPagesPath?: string;
};

declare class WebServer {
  constructor(
    client: Discord.Client, db: TypedDB, keys: Keys,
    config?: WebServerConfig,
    errorLoggingFunction?: (err: Error, req: express.Request, res: express.Response) => unknown
  );

  client: Discord.Client<true>;
  db: TypedDB;
  config: Required<WebServerConfig> & { baseUrl: string };

  keys: Keys;

  /** set to true once this.init() ran */
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

  static createNavigationButtons(dir: Dirent[], path: string, reqPath: string): Promise<string | undefined>;

  logError(err: Error, req: express.Request, res: express.Response): unknown;
}

declare class VoteSystem {
  constructor(client: Discord.Client<true>, db: TypedDB, config: { domain: string; webhookUrl?: string; ownerIds: string[] });

  client: Discord.Client<true>;
  config: { domain: string; webhookUrl?: string; ownerIds: string[] };

  fetchAll(): FeatureRequest[];

  get(id: FeatureRequest['id']): FeatureRequest | undefined;
  get(): Record<FeatureRequest['id'], FeatureRequest>;

  getMany(amount: number, offset?: number, filter?: string, includePendig?: boolean, userId?: Discord.Snowflake): { cards: FeatureRequest[]; moreAvailable: boolean };
  add(title: string, body: string, userId?: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  approve(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<FeatureRequest | RequestError>;
  update(features: FeatureRequest | FeatureRequest[], userId: Discord.Snowflake): Promise<{ success: true } | { code: 400; errors: { id: FeatureRequest['id']; error: string }[] }>;
  delete(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<{ success: true } | RequestError>;
  addVote(featureId: FeatureRequest['id'], userId: Discord.Snowflake, type: 'up' | 'down'): Promise<FeatureRequest | RequestError>;
  sendToWebhook(title: string, description: string, color?: number, url?: string): Promise<{ success: boolean } | RequestError>;
  validate(userId: Discord.Snowflake): RequestError | undefined;

  static formatDesc(params: { title?: string; body?: string }): string;

  /** @param date A date obj or millseconds*/
  static isInCurrentWeek(date: Date | number): boolean;
}


type FlattenedDatabase = { [DB in keyof Database]: FlattenObject<Database[DB]>; };

/* https://github.com/blazejkustra/dynamode/blob/fd3abf1e420612811c3eba96ec431e00c28b2783/lib/utils/types.ts#L10
   Flatten entity  */
type FlattenObject<TValue> = CollapseEntries<CreateObjectEntries<TValue, TValue>>;

type Entry = { key: string; value: unknown };
type EmptyEntry<TValue> = { key: ''; value: TValue };
type ExcludedTypes = Date | Set<unknown> | Map<unknown, unknown> | unknown[];
type ArrayEncoder = `[${bigint}]`;

type EscapeArrayKey<TKey extends string> = TKey extends `${infer TKeyBefore}.${ArrayEncoder}${infer TKeyAfter}`
  ? EscapeArrayKey<`${TKeyBefore}${ArrayEncoder}${TKeyAfter}`>
  : TKey;

// Transforms entries to one flattened type
type CollapseEntries<TEntry extends Entry> = { [E in TEntry as EscapeArrayKey<E['key']>]: E['value']; };

// Transforms array type to object
type CreateArrayEntry<TValue, TValueInitial> = OmitItself<
  TValue extends unknown[] ? Record<ArrayEncoder, TValue[number]> : TValue,
  TValueInitial
>;

// Omit the type that references itself
type OmitItself<TValue, TValueInitial> = TValue extends TValueInitial
  ? EmptyEntry<TValue>
  : OmitExcludedTypes<TValue, TValueInitial>;

// Omit the type that is listed in ExcludedTypes union
type OmitExcludedTypes<TValue, TValueInitial> = TValue extends ExcludedTypes
  ? EmptyEntry<TValue>
  : CreateObjectEntries<TValue, TValueInitial>;

type CreateObjectEntries<TValue, TValueInitial> = TValue extends object ? {

  // Checks that Key is of type string
  [TKey in keyof TValue]-?: TKey extends string
    ? // Nested key can be an object, run recursively to the bottom
    CreateArrayEntry<TValue[TKey], TValueInitial> extends infer TNestedValue
      ? TNestedValue extends Entry
        ? TNestedValue['key'] extends ''
          ? { key: TKey; value: TNestedValue['value'] }
          : { key: `${TKey}.${TNestedValue['key']}`; value: TNestedValue['value'] } | { key: TKey; value: TValue[TKey] }
        : never
      : never
    : never;
}[keyof TValue] // Builds entry for each key
  : EmptyEntry<TValue>;

// Source: https://github.com/Mephisto5558/Teufelsbot/blob/main/globals.d.ts#L494
declare class TypedDB extends DBClass {
  /**
   * generates required database entries from {@link ./Templates/db_collections.json}.
   * @param overwrite overwrite existing collection, default: `false`*/
  generate(overwrite?: boolean): Promise<void>;

  get(): undefined;
  get<DB extends keyof Database>(db: DB): Database[DB];
  get<DB extends keyof Database, K extends keyof FlattenedDatabase[DB]>(db: DB, key: K): FlattenedDatabase[DB][K];

  update<DB extends keyof Database, FDB extends FlattenedDatabase[DB], K extends keyof FDB>(db: DB, key: K, value: FDB[K]): Promise<Database[DB]>;
  set<DB extends keyof Database, FDB extends FlattenedDatabase[DB]>(db: DB, value: FDB[keyof FDB], overwrite?: boolean): Promise<Database[DB]>;
  delete<DB extends keyof Database>(db: DB, key?: keyof FlattenedDatabase[DB]): Promise<boolean>;

  push<DB extends keyof Database, FDB extends FlattenedDatabase[DB], K extends keyof FDB>(db: DB, key: K, ...value: FDB[K][]): Promise<Database[DB]>;
  pushToSet<DB extends keyof Database, FDB extends FlattenedDatabase[DB], K extends keyof FDB>(db: DB, key: K, ...value: FDB[K][]): Promise<Database[DB]>;
}