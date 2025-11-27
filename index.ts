/* eslint-disable import-x/extensions, sonarjs/cognitive-complexity, @typescript-eslint/no-unsafe-type-assertion */
/* eslint sonarjs/no-nested-functions: [warn, { threshold: 4 }] */

import { GatewayIntentBits, Status } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { constants } from 'node:http2';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formTypes as softUIFormTypes } from 'dbd-soft-ui';
import DBD from 'discord-dashboard';

import { VoteSystem } from './voteSystem.js';
import { MongoStore, WebServerSetupper } from './webServer/index.js';

/* eslint-disable-next-line import-x/no-namespace */
import type * as Discord from 'discord.js';
import type { AnyDB } from '@mephisto5558/mongoose-db';
import type { NextFunction, Request, Response } from 'express';
import type express from 'express';
import type { MemoryStore } from 'express-session';
import type { HttpError } from 'http-errors';
import type { Authenticator } from 'passport';
import type { Database } from './database.ts';
import type { VoteSystemConfig, VoteSystemSettings } from './voteSystem.ts';
import type { DashboardOptions, DashboardThemeOptions } from './webServer/index.ts';

const DEFAULT_PORT = 8000;

// Source: https://github.com/microsoft/TypeScript/issues/54451#issue-1732749888
export type Omit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] };

type Support = { mail?: string; discord?: string };
type Keys = { secret: string; dbdLicense: string };

type formTypes = Omit<globalThis.formTypes & typeof softUIFormTypes, 'embedBuilder'> & {
  embedBuilder: ReturnType<globalThis.formTypes['embedBuilder']>;
  _embedBuilder: globalThis.formTypes['embedBuilder'];
};

export type dashboardSetting = {
  id: string;
  name: string;
  description: string;
  type: formTypes | keyof formTypes | ((this: WebServer) => formTypes | Promise<formTypes>);
  position: number;
  disableToggle?: boolean;

  get?(this: WebServer, option: option, setting: optionOptions): unknown;
  set?(this: WebServer, option: option, setting: optionOptions): unknown;

  /** if returns `undefined`, will interpret as `{ allowed: true }` */
  auth?: false | ((
    this: WebServer, guild: allowedCheckOption['guild'], user: allowedCheckOption['user']
  ) => { allowed: true } | { allowed: false; errorMessage?: string }) | undefined;
};

export type allowedCheckOption = {
  guild: { id: Discord.Snowflake };
  user: { id: Discord.Snowflake };
};

export type optionOptions = {
  guild: { id: Discord.Snowflake; object?: Discord.Guild };
  user: { id: Discord.Snowflake };
  data?: unknown;
};

export type option = Omit<globalThis.option, 'optionId' | 'allowedCheck' | 'getActualSet' | 'setNew'> & {
  position: number;
  optionId: NonNullable<globalThis.option['optionId']>;
  allowedCheck?(options: allowedCheckOption): Promise<unknown>;

  getActualSet?(options: optionOptions): Promise<unknown>;
  setNew?(options: optionOptions): Promise<unknown>;
};

export type category = Omit<globalThis.category, 'categoryOptionsList'> & Pick<option, 'getActualSet' | 'setNew' | 'position'> & {
  categoryOptionsList: option[];
};

type methods = 'get' | 'post' | 'put' | 'delete' | 'patch';
export type customPage = {
  method?: methods | methods[];
  permissionCheck?(this: express.Request): boolean | Promise<boolean>;
  title: string;
  static?: boolean;
  run?: URL | string | number | boolean | ((this: WebServer, arg1: express.Response, arg2: express.Request, arg3: express.NextFunction) => unknown);
};
export type commands = { category: string; subTitle: string; aliasesDisabled: boolean; list: Record<string, unknown>[] }[];

export type WebServerConfig = {
  support: Support; port: number; domain: string; ownerIds: string[];

  /**
   * ```js
   * if (port) `${WebServer['config']['domain']}:${WebServer['config']['port']}`
   * else WebServer['config']['domain']
   * ``` */
  baseUrl: string; webhookUrl?: string; callbackURL?: string; authUrl?: string; defaultAPIVersion: number;
  errorPagesDir?: string; settingsPath?: string; customPagesPath?: string;
};

export class WebServer<Ready extends boolean = boolean> {
  constructor(
    client: Discord.Client<Ready>, db: WebServer['db'], keys: Keys,
    config: Partial<WebServerConfig> = {},
    errorLoggingFunction?: (err: Error, req?: express.Request, res?: express.Response) => unknown
  ) {
    this.config = { ...this.config, ...config };
    if (!this.config.domain.startsWith('http')) this.config.domain = `http://${this.config.domain}`;
    this.config.baseUrl = config.port == undefined ? this.config.domain : `${this.config.domain}:${this.config.port}`;

    this.#validateConstructorParams(client, db, keys, config, errorLoggingFunction);

    this.client = client;
    this.db = db;
    this.keys = keys;
    if (errorLoggingFunction) this.logError = errorLoggingFunction;
  }

  config: WebServerConfig = {
    support: {},
    ownerIds: [],
    domain: process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost',
    port: Number(process.env.PORT ?? process.env.SERVER_PORT ?? DEFAULT_PORT),
    baseUrl: '',
    defaultAPIVersion: 1
  };

  client: Discord.Client<Ready>;
  db: AnyDB<Database>;

  keys: Keys;

  /** set to true once this.init() ran */
  initiated: Ready = false as Ready;

  passport!: Authenticator;
  sessionStore!: MemoryStore;
  dashboardOptionCount: unknown[] = [];

  /** modified default settings of embedBuilder */
  formTypes: formTypes = {
    ...DBD.formTypes, ...softUIFormTypes,
    embedBuilder: DBD.formTypes.embedBuilder({}),
    _embedBuilder: DBD.formTypes.embedBuilder
  };

  dashboard!: Dashboard;
  router!: express.Router;
  app!: express.Express;
  voteSystem!: VoteSystem;

  #setupper!: WebServerSetupper;

  logError: (err: Error, req?: express.Request, res?: express.Response) => unknown = console.error;

  async init(
    dashboardConfig: DashboardOptions, themeConfig: DashboardThemeOptions,
    voteSystemConfig: VoteSystemConfig, voteSystemSettings: VoteSystemSettings = {}
  ): Promise<WebServer<true>> {
    if (this.initiated) throw new Error('Already initiated');

    while (this.client.ws.status != Status.Ready) await new Promise(res => void setTimeout(res, 10));

    const client = this.client as Discord.Client<true>;
    await client.application.fetch();

    this.#setupper = new WebServerSetupper(client, this.db, {
      clientSecret: this.keys.secret, baseUrl: this.config.baseUrl,
      defaultAPIVersion: this.config.defaultAPIVersion
    });

    this.formTypes = {
      ...this.formTypes,
      /* eslint-disable-next-line no-underscore-dangle */
      embedBuilder: this.formTypes._embedBuilder({
        username: client.user.username,
        avatarURL: client.user.displayAvatarURL({ forceStatic: true }),
        defaultJson: {}
      })
    };

    this.passport = this.#setupper.setupAuth(this.config.authUrl, this.config.callbackURL);
    this.sessionStore = new MongoStore(this.db);
    this.dashboard = await this.#setupper.setupDashboard(this.keys.dbdLicense, {
      ...dashboardConfig,
      errorPagesDir: this.config.errorPagesDir,
      theme: dashboardConfig.theme ?? this.#setupper.setupDashboardTheme(themeConfig),
      port: this.config.port, domain: this.config.domain,
      settings: await this.#getSettings() as globalThis.category[]
    });
    this.router = this.#setupper.setupRouter(this as WebServer<true>, this.config.customPagesPath);
    this.app = this.#setupper.setupApp(

      // @ts-expect-error Works, but is a TODO.
      this.keys.secret, this.sessionStore,
      [this.router, this.dashboard.getApp() as express.Handler, this.#reqErrorHandler.bind(this)]
    );

    this.voteSystem = new VoteSystem(client, this.db, { ...this.config, ...voteSystemConfig }, voteSystemSettings);

    this.app.listen(this.config.port, () => console.log(`Website is online on ${this.config.baseUrl}.`));

    this.initiated = true as Ready;
    return this as WebServer<true>;
  }

  #validateConstructorParams(
    client?: WebServer<Ready>['client'], db?: WebServer<Ready>['db'], keys?: WebServer<Ready>['keys'],
    config?: Partial<WebServerConfig>, errorLoggingFunction?: WebServer<Ready>['logError']
  ): void {
    if (!client?.options.intents.has(GatewayIntentBits.Guilds)) throw new Error('Client must have the "Guilds" gateway intent.');
    if (!db?.update || !db.get) throw new Error('Invalid DB'); /* eslint-disable-line @typescript-eslint/no-unnecessary-condition */
    if (!keys?.secret) throw new Error('Missing discord application secret');
    if (!keys.dbdLicense) throw new Error('Missing dbdLicense. Get one here (free): https://assistantscenter.com/discord-dashboard/v2');
    if (!config?.domain?.startsWith('http://') && !this.config.domain.startsWith('https://')) throw new Error('config.domain must start with "http://" or "https://"!');
    if (typeof errorLoggingFunction != 'function') throw new Error('Invalid errorLoggingFunction');
  }

  async #getSettings(): Promise<category[]> {
    if (!this.config.settingsPath) return [];

    const categoryOptionList: category[] = [];
    for (const subFolder of await readdir(this.config.settingsPath, { withFileTypes: true })) {
      if (!subFolder.isDirectory()) continue;

      const
        index = (await import(
          pathToFileURL(path.join(process.cwd(), this.config.settingsPath, subFolder.name, '_index.json')).href, { with: { type: 'json' } }
        ) as { default: dashboardSetting }).default,
        optionList: option[] = [{
          optionId: `${index.id}.spacer`,
          title: 'Important!',
          description: 'You need to press the submit button on the bottom of the page to save settings!',
          optionType: this.formTypes.spacer({}),
          position: -1
        }];

      if (!index.disableToggle) {
        optionList.push({
          optionId: `${index.id}.enable`,
          optionName: 'Enable Module',
          optionDescription: 'Enable this Module',
          position: 0,
          optionType: this.formTypes.switch()
        });
      }

      for (const file of await readdir(path.join(this.config.settingsPath, subFolder.name))) {
        if (!file.endsWith('.js')) continue;

        const setting = (await import(
          pathToFileURL(path.join(process.cwd(), this.config.settingsPath, subFolder.name, file)).href
        ) as { default: dashboardSetting }).default;

        if (setting.type == 'spacer') {
          optionList.push({
            optionId: `${index.id}.spacer`,
            title: setting.name,
            description: setting.description,
            optionType: this.formTypes[setting.type]({}),
            position: setting.position
          });
        }
        else {
          let optionType = setting.type as unknown;
          if (typeof optionType == 'string' && optionType in this.formTypes) optionType = this.formTypes[optionType as keyof WebServer['formTypes']];
          if (typeof optionType == 'function') optionType = await optionType.call(this);

          const option: option = {
            optionType: optionType as option['optionType'],
            optionId: `${index.id}.${setting.id}`,
            optionName: setting.name,
            optionDescription: setting.description,
            position: setting.position,
            allowedCheck: async ({ guild, user }) => {
              if ((await this.db.get('botSettings', 'blacklist'))?.includes(user.id))
                return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
              if (setting.auth === false) return { allowed: false, errorMessage: 'This feature has been disabled.' };
              return setting.auth?.call(this, guild, user) ?? { allowed: true };
            }
          };


          optionList.push(option);
          if ('get' in setting) {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            option.getActualSet = function getWrapper(this: WebServer, ...args): any {
              return setting.get?.call(this, option, ...args);
            };
          }
          if ('set' in setting) {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            option.setNew = function setWrapper(this: WebServer, ...args): any {
              return setting.set?.call(this, option, ...args);
            };
          }
        }
      }

      categoryOptionList.push({
        categoryId: index.id,
        categoryName: index.name,
        categoryDescription: index.description,
        position: index.position,
        getActualSet: async option => Promise.all(optionList.map(async e => {
          if (e.getActualSet) return { optionId: e.optionId, data: e.getActualSet.call(this, option) };
          const dataPath = e.optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);
          if (dataPath.split('.').at(-1) == 'spacer') return { optionId: e.optionId, data: e.description };

          const data = await this.db.get('guildSettings', `${option.guild.id}.${dataPath}`)
            ?? await this.db.get('botSettings', `defaultGuild.${dataPath}`);

          return { optionId: e.optionId, data };
        })),
        setNew: async (

          { guild, user, data: dataArray }: Parameters<NonNullable<category['setNew']>>[0] & { data: { optionId: string; data: JSONValue }[] }
        ) => {
          for (const { optionId, data } of dataArray) {
            const option = optionList.find(e => e.optionId == optionId);
            if (option?.setNew) {
              await option.setNew.call(this, { guild, user, optionId, data });
              continue;
            }

            const dataPath = optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);

            if (this.db.get('guildSettings', `${guild.id}.${dataPath}`) === data) continue;
            if (data && typeof data == 'object' && 'embed' in data && typeof data.embed == 'object' && data.embed && 'description' in data.embed)
              data.embed.description ??= ' ';

            await this.db.update('guildSettings', `${guild.id}.${dataPath}`, data);
          }
        },
        categoryOptionsList: optionList.toSorted((a, b) => a.position - b.position)
      });
    }

    return categoryOptionList.toSorted((a, b) => a.position - b.position);
  }

  /**
   * @param err
   * @param req
   * @param res
   * @param next
   * @returns */
  #reqErrorHandler(err: Error & { code?: unknown } | HttpError, req: Request, res: Response, next: NextFunction): void {
    if (err.code != 'ENOENT') this.logError(err);

    const status = 'statusCode' in err ? err.statusCode : constants.HTTP_STATUS_INTERNAL_SERVER_ERROR;

    // send html only to browser
    if (!this.config.errorPagesDir || !req.headers['user-agent']?.includes('Mozilla'))
      return void res.sendStatus(status);

    const filePath = path.join(this.config.errorPagesDir, `${status}.html`);

    try { return res.status(status).sendFile(filePath, { root: process.cwd() }); }
    catch (err) {
      if (err instanceof Error && 'code' in err && err.code != 'ENOENT') return this.#reqErrorHandler(err, req, res, next);
    }
  }

  valueOf(): string {
    return `WebServer on ${this.config.baseUrl}`; // Prevents recursion with discord.js Client#toJSON()
  }
}

export default WebServer;
export type { VoteSystem };