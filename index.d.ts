import type Discord from 'discord.js';
import type express from 'express';
import type { PathLike } from 'node:fs';
import type { MemoryStore } from 'express-session';
import type { PassportStatic } from 'passport';
import type { formTypes } from 'discord-dashboard';
import type { FormTypes } from 'dbd-soft-ui';
import type { DB } from '@mephisto5558/mongoose-db';
import type { Database } from './database';
import type { DashboardOptions, DashboardThemeOptions } from './webServer';

export { WebServer };
export type { VoteSystem, VoteSystemConfig, VoteSystemSettings, FeatureRequest, dashboardSetting, customPage, commands, WebServerConfig };
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
  webhookUrl?: string; callbackURL?: string; defaultAPIVersion?: string;
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
  formTypes: (Omit<formTypes, 'embedBuilder'> & { embedBuilder: ReturnType<(typeof formTypes)['embedBuilder']>; _embedBuilder: formTypes['embedBuilder'] }) | null;
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
    { success: true }
    | { code: HTTP_STATUS_BAD_REQUEST; errors: { id: FeatureRequest['id']; error: string }[] }
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


type FlattenedDatabase = { [DBK in keyof Database]: FlattenObject<Database[DBK]>; };

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

    // Nested key can be an object, run recursively to the bottom
    ? CreateArrayEntry<TValue[TKey], TValueInitial> extends infer TNestedValue
      ? TNestedValue extends Entry
        ? TNestedValue['key'] extends ''
          ? { key: TKey; value: TNestedValue['value'] }
          : { key: `${TKey}.${TNestedValue['key']}`; value: TNestedValue['value'] } | { key: TKey; value: TValue[TKey] }
        : never
      : never
    : never;
}[keyof TValue] // Builds entry for each key
  : EmptyEntry<TValue>;

// Source: https://github.com/Mephisto5558/Teufelsbot/blob/main/globals.d.ts#L339
declare module '@mephisto5558/mongoose-db' {
  interface NoCacheDB {
    /**
     * generates required database entries from {@link ./Templates/db_collections.json}.
     * @param overwrite overwrite existing collection, default: `false` */
    generate(overwrite?: boolean): Promise<void>;

    get<DBK extends keyof Database>(db: DBK): Promise<Database[DBK]>;
    get<DBK extends keyof Database, K extends keyof FlattenedDatabase[DBK]>(db: DBK, key: K): Promise<
      Database[DBK] extends Record<string | number, unknown> ? FlattenedDatabase[DBK][K] | undefined : FlattenedDatabase[DBK][K]
    >;
    update<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(db: DBK, key: K, value: FDB[K]): Promise<Database[DBK]>;
    set<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK]>(db: DBK, value: FDB[keyof FDB], overwrite?: boolean): Promise<Database[DBK]>;
    delete<DBK extends keyof Database>(db: DBK, key?: keyof FlattenedDatabase[DBK]): Promise<boolean>;
    push<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(db: DBK, key: K, ...value: FDB[K][]): Promise<Database[DBK]>;
    pushToSet<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(db: DBK, key: K, ...value: FDB[K][]): Promise<Database[DBK]>;
  }

  // @ts-expect-error 2300 // overwriting the class so ofc it is declared twice
  interface DB extends NoCacheDB {
    get(): undefined;
    get<DBK extends keyof Database>(this: DB, db: DBK): Database[DBK];
    get<DBK extends keyof Database, K extends keyof FlattenedDatabase[DBK]>(this: DB, db: DBK, key: K): (
      Database[DBK] extends Record<string | number, unknown> ? FlattenedDatabase[DBK][K] | undefined : FlattenedDatabase[DBK][K]
    );
    update<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(this: DB, db: DBK, key: K, value: FDB[K]): Promise<Database[DBK]>;
    set<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK]>(this: DB, db: DBK, value: FDB[keyof FDB], overwrite?: boolean): Promise<Database[DBK]>;
    delete<DBK extends keyof Database>(this: DB, db: DBK, key?: keyof FlattenedDatabase[DBK]): Promise<boolean>;
    push<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(this: DB, db: DBK, key: K, ...value: FDB[K][]): Promise<Database[DBK]>;
    pushToSet<DBK extends keyof Database, FDB extends FlattenedDatabase[DBK], K extends keyof FDB>(this: DB, db: DBK, key: K, ...value: FDB[K][]): Promise<Database[DBK]>;
  }
}