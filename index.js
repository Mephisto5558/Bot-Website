/* eslint sonarjs/no-nested-functions: ["error", { threshold: 4 }] */

const
  { GatewayIntentBits, Status } = require('discord.js'),
  { readFile, readdir } = require('node:fs/promises'),
  { HTTP_STATUS_INTERNAL_SERVER_ERROR } = require('node:http2').constants,
  path = require('node:path'),
  DBDSoftUI = require('dbd-soft-ui'),
  DBD = require('discord-dashboard'),

  VoteSystem = require('./voteSystem'),
  { MongoStore, WebServerSetupper } = require('./webServer'),

  DEFAULT_PORT = 8000;

class WebServer {
  #setupper;
  passport; sessionStore; formTypes; dashboard; router; app; voteSystem;
  dashboardOptionCount = []; initiated = false;

  /**
   * @param {import('.').WebServer['client']} client
   * @param {import('.').WebServer['db']} db
   * @param {import('.').WebServer['keys']} keys
   * @param {import('.').WebServerConfig?} config
   * @param {import('.').WebServer['logError']} errorLoggingFunction */
  constructor(client, db, keys, config, errorLoggingFunction = console.error) {
    config = {
      support: {},
      ownerIds: [],
      domain: process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost',
      port: process.env.PORT ?? process.env.SERVER_PORT ?? DEFAULT_PORT,
      defaultAPIVersion: 1,
      ...config
    };
    if (!config.domain.startsWith('http')) config.domain = `http://${config.domain}`;
    config.baseUrl = config.port == undefined ? config.domain : config.domain + ':' + config.port;

    this.#validateConstructorParams(client, db, keys, config, errorLoggingFunction);

    this.client = client;
    this.db = db;
    this.config = config;
    this.keys = keys;
    this.logError = errorLoggingFunction;

    this.#setupper = new WebServerSetupper(this.client, this.db, { clientSecret: this.keys.secret, baseURL: this.config.domain, defaultAPIVersion: this.config.defaultAPIVersion });
  }

  /**
   * @param {import('.').WebServer['client']?} client
   * @param {import('.').WebServer['db']?} db
   * @param {import('.').WebServer['keys']?} keys
   * @param {import('.').WebServerConfig?} config
   * @param {import('.').WebServer['logError']?} errorLoggingFunction
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
    /** @typedef {ConstructorParameters<ReturnType<import('discord-dashboard')['UpdatedClass']>>[0]['settings'][number]} category */
    /** @type {category[]} */
    const categoryOptionList = [];

    for (const subFolder of await readdir(this.config.settingsPath, { withFileTypes: true })) {
      if (!subFolder.isDirectory()) continue;

      const
        index = JSON.parse(await readFile(path.join(this.config.settingsPath, subFolder.name, '_index.json'), 'utf8')),
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

        /** @type {import('.').dashboardSetting} */
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
          if (this.formTypes[setting.type]) setting.type = this.formTypes[setting.type];

          const option = {
            optionId: `${index.id}.${setting.id}`,
            optionName: setting.name,
            optionDescription: setting.description,
            optionType: typeof setting.type == 'function' ? await setting.type.call(this) : setting.type,
            position: setting.position,
            allowedCheck: ({ guild, user }) => {
              if (this.db.get('botSettings', 'blacklist')?.includes(user.id)) return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
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
        setNew: async ({ guild, data: dataArray }) => {
          for (const { optionId, data } of dataArray) {
            const option = optionList.find(e => e.optionId == optionId);
            if (option?.setNew) {
              await option.setNew.call(this, { guild, optionId, data });
              continue;
            }

            const dataPath = optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);

            if (this.db.get('guildSettings', `${guild.id}.${dataPath}`) === data) continue;
            if (data.embed) data.embed.description ??= ' ';

            await this.db.update('guildSettings', `${guild.id}.${dataPath}`, data);
          }
        },
        categoryOptionsList: optionList.toSorted((a, b) => a.position - b.position)
      });
    }

    return categoryOptionList.sort((a, b) => a.position - b.position);
  }

  /**
   * @param {Error | import('http-errors').HttpError} err
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next */
  #reqErrorHandler(err, req, res, next) {
    if (err.code != 'ENOENT') this.logError(err);

    // send html only to browser
    if (!this.config.errorPagesDir || !req.headers['user-agent']?.includes('Mozilla'))
      return res.sendStatus(err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR);

    const filePath = path.join(this.config.errorPagesDir, `${err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR}.html`);

    try {
      return res
        .status(err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR)
        .sendFile(filePath, { root: process.cwd() });
    }
    catch (err) {
      if (err.code != 'ENOENT') return this.#reqErrorHandler(err, req, res, next);
    }
  }

  /** @type {import('.').WebServer['init']} */
  async init(dashboardConfig = {}, themeConfig = {}, voteSystemConfig = {}, voteSystemSettings = {}) {
    while (this.client.ws.status != Status.Ready) await new Promise(res => setTimeout(res, 10));
    await this.client.application.fetch();

    if (this.initiated) throw new Error('Already initiated');

    this.formTypes = {
      ...DBDSoftUI.formTypes, ...DBD.formTypes, _embedBuilder: DBD.formTypes.embedBuilder, embedBuilder: DBD.formTypes.embedBuilder({
        username: this.client.user.username,
        avatarURL: this.client.user.displayAvatarURL({ forceStatic: true }),
        defaultJson: {}
      })
    };

    this.passport = this.#setupper.setupAuth(this.config.callbackURL);
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

    this.app.listen(this.config.port, () => { console.log(`Website is online on ${this.config.baseUrl}.`); });

    this.initiated = true;
    return this;
  }

  valueOf() {
    return `WebServer on ${this.config.baseUrl}`; // Prevents recursion with discord.js Client#toJSON()
  }
}

module.exports = { WebServer, default: WebServer };