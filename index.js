/* eslint sonarjs/no-nested-functions: [warn, { threshold: 4 }] */

/**
 * @import { HttpError } from 'http-errors'
 * @import { Request, Response, NextFunction } from 'express'
 * @import { WebServerConfig, WebServer as WebServerT, dashboardSetting, customPage } from '.' */

const
  { GatewayIntentBits, Status } = require('discord.js'),
  { readdir } = require('node:fs/promises'),
  { HTTP_STATUS_INTERNAL_SERVER_ERROR } = require('node:http2').constants,
  path = require('node:path'),
  DBDSoftUI = require('dbd-soft-ui'),
  DBD = require('discord-dashboard'),

  VoteSystem = require('./voteSystem'),
  { MongoStore, WebServerSetupper } = require('./webServer'),

  DEFAULT_PORT = 8000;

class WebServer {
  #setupper;
  dashboardOptionCount = []; initiated = false;

  /**
   * @param {WebServerT['client']} client
   * @param {WebServerT['db']} db
   * @param {WebServerT['keys']} keys
   * @param {Partial<WebServerConfig> | undefined} config
   * @param {WebServerT['logError']} errorLoggingFunction */
  constructor(client, db, keys, config, errorLoggingFunction = console.error) {
    /** @type {WebServerConfig} */
    this.config = {
      support: {},
      ownerIds: [],
      domain: process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost',
      port: process.env.PORT ?? process.env.SERVER_PORT ?? DEFAULT_PORT,
      defaultAPIVersion: 1,
      ...config
    };
    if (!this.config.domain.startsWith('http')) this.config.domain = `http://${this.config.domain}`;
    this.config.baseUrl = config.port == undefined ? this.config.domain : `${this.config.domain}:${this.config.port}`;

    this.#validateConstructorParams(client, db, keys, config, errorLoggingFunction);

    this.client = client;
    this.db = db;
    this.keys = keys;
    this.logError = errorLoggingFunction;

    this.#setupper = new WebServerSetupper(this.client, this.db, {
      clientSecret: this.keys.secret, baseUrl: this.config.baseUrl,
      defaultAPIVersion: this.config.defaultAPIVersion
    });
  }

  /**
   * @param {WebServerT['client'] | undefined} client
   * @param {WebServerT['db'] | undefined} db
   * @param {WebServerT['keys'] | undefined} keys
   * @param {Partial<WebServerConfig> | undefined} config
   * @param {WebServerT['logError'] | undefined} errorLoggingFunction
   * @throws {Error} on invalid data */
  #validateConstructorParams(client, db, keys, config, errorLoggingFunction) {
    if (!client?.options.intents.has(GatewayIntentBits.Guilds)) throw new Error('Client must have the "Guilds" gateway intent.');
    if (!db?.cache) throw new Error('Missing db property');
    if (!keys?.secret) throw new Error('Missing discord application secret');
    if (!keys.dbdLicense) throw new Error('Missing dbdLicense. Get one here: https://assistantscenter.com/discord-dashboard/v2');
    if (!config.domain.startsWith('http://') && !this.config.domain.startsWith('https://')) throw new Error('config.domain must start with "http://" or "https://"!');
    if (typeof errorLoggingFunction != 'function') throw new Error('Invalid errorLoggingFunction');
  }

  async #getSettings() {
    /** @typedef {globalThis.category & Pick<globalThis.option, 'getActualSet' | 'setNew'>} category */
    /** @type {category[]} */
    const categoryOptionList = [];

    for (const subFolder of await readdir(this.config.settingsPath, { withFileTypes: true })) {
      if (!subFolder.isDirectory()) continue;

      const
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- can't do anything about it */
        /** @type {dashboardSetting} */ index = require(path.join(process.cwd(), this.config.settingsPath, subFolder.name, '_index.json')),
        /** @type {category['categoryOptionsList']} */ optionList = [{
          optionId: `${index.id}.spacer`,
          title: 'Important!',
          description: 'You need to press the submit button on the bottom of the page to save settings!',
          optionType: DBDSoftUI.formTypes.spacer(),
          position: -1
        }];

      if (!index.disableToggle) {
        optionList.push({
          optionId: `${index.id}.enable`,
          optionName: 'Enable Module',
          optionDescription: 'Enable this Module',
          position: 0,
          optionType: DBD.formTypes.switch()
        });
      }

      for (const file of await readdir(path.join(this.config.settingsPath, subFolder.name))) {
        if (!file.endsWith('.js')) continue;

        /** @type {dashboardSetting} */
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- can't do anything about it */
        const setting = require(path.join(process.cwd(), this.config.settingsPath, subFolder.name, file));

        if (setting.type == 'spacer') {
          optionList.push({
            optionId: `${index.id}.spacer`,
            title: setting.name,
            description: setting.description,
            optionType: DBDSoftUI.formTypes[setting.type](),
            position: setting.position
          });
        }
        else {
          if (typeof setting.type == 'string') setting.type = this.formTypes[setting.type];

          /** @type {option} */
          const option = {
            optionId: `${index.id}.${setting.id}`,
            optionName: setting.name,
            optionDescription: setting.description,
            optionType: typeof setting.type == 'function' ? await setting.type.call(this) : setting.type,
            position: setting.position,
            allowedCheck: ({ guild, user }) => {
              if (this.db.get('botSettings', 'blacklist')?.includes(user.id))
                return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
              if (setting.auth === false) return { allowed: false, errorMessage: 'This feature has been disabled.' };
              return setting.auth?.(guild, user) ?? { allowed: true };
            }
          };

          optionList.push(option);
          if (setting.get) {
            option.getActualSet = function getWrapper(...args) {
              return setting.get.call(this, option, ...args);
            };
          }
          if (setting.set) {
            option.setNew = function setWrapper(...args) {
              return setting.set.call(this, option, ...args);
            };
          }
        }
      }

      categoryOptionList.push({
        categoryId: index.id,
        categoryName: index.name,
        categoryDescription: index.description,
        position: index.position,
        getActualSet: option => optionList.map(e => {
          if (e.getActualSet) return { optionId: e.optionId, data: e.getActualSet.call(this, option) };
          const dataPath = e.optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);
          if (dataPath.split('.').at(-1) == 'spacer') return { optionId: e.optionId, data: e.description };

          const data = this.db.get('guildSettings', `${option.guild.id}.${dataPath}`) ?? this.db.get('botSettings', `defaultGuild.${dataPath}`);
          return { optionId: e.optionId, data };
        }),
        setNew: async (

          /** @type {Parameters<category['setNew']>[0] & { data: { optionId: string; data: JSONValue }[] }} */
          { guild, user, data: dataArray }
        ) => {
          for (const { optionId, data } of dataArray) {
            const option = optionList.find(e => e.optionId == optionId);
            if (option?.setNew) {
              await option.setNew.call(this, { guild, user, optionId, data });
              continue;
            }

            const dataPath = optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);

            if (this.db.get('guildSettings', `${guild.id}.${dataPath}`) === data) continue;
            if (typeof data == 'object' && 'embed' in data) data.embed.description ??= ' ';

            await this.db.update('guildSettings', `${guild.id}.${dataPath}`, data);
          }
        },
        categoryOptionsList: optionList.toSorted((a, b) => a.position - b.position)
      });
    }

    return categoryOptionList.toSorted((a, b) => a.position - b.position);
  }

  /**
   * @param {Error | HttpError} err
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @returns {void} */
  #reqErrorHandler(err, req, res, next) {
    if (err.code != 'ENOENT') this.logError(err);

    const status = 'statusCode' in err ? err.statusCode : HTTP_STATUS_INTERNAL_SERVER_ERROR;

    // send html only to browser
    if (!this.config.errorPagesDir || !req.headers['user-agent']?.includes('Mozilla'))
      return void res.sendStatus(status);

    const filePath = path.join(this.config.errorPagesDir, `${status}.html`);

    try { return res.status(status).sendFile(filePath, { root: process.cwd() }); }
    catch (err) {
      if (err.code != 'ENOENT') return this.#reqErrorHandler(err, req, res, next);
    }
  }

  /** @type {WebServerT['init']} */
  async init(dashboardConfig = {}, themeConfig = {}, voteSystemConfig = {}, voteSystemSettings = {}) {
    if (this.initiated) throw new Error('Already initiated');

    while (this.client.ws.status != Status.Ready) await new Promise(res => void setTimeout(res, 10));
    await this.client.application.fetch();

    this.formTypes = {
      ...DBDSoftUI.formTypes, ...DBD.formTypes, _embedBuilder: DBD.formTypes.embedBuilder, embedBuilder: DBD.formTypes.embedBuilder({
        username: this.client.user.username,
        avatarURL: this.client.user.displayAvatarURL({ forceStatic: true }),
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
      settings: await this.#getSettings()
    });
    this.router = this.#setupper.setupRouter(this.config.customPagesPath, this);
    this.app = this.#setupper.setupApp(this.keys.secret, this.sessionStore, [this.router, this.dashboard.getApp(), this.#reqErrorHandler.bind(this)]);

    this.voteSystem = new VoteSystem(this.client, this.db, { ...this.config, ...voteSystemConfig }, voteSystemSettings);

    this.app.listen(this.config.port, () => console.log(`Website is online on ${this.config.baseUrl}.`));

    this.initiated = true;
    return this;
  }

  valueOf() {
    return `WebServer on ${this.config.baseUrl}`; // Prevents recursion with discord.js Client#toJSON()
  }
}

module.exports = { WebServer, default: WebServer };