/* eslint sonarjs/no-nested-functions: ["error", { threshold: 4 }] */
/* eslint-disable max-lines */

const
  { readdir, readFile } = require('node:fs/promises'),
  DDB = require('discord-dashboard'),
  { GatewayIntentBits, Status } = require('discord.js'),
  { xss } = require('express-xss-sanitizer'),
  asyncHandler = require('express-async-handler'),
  bodyParser = require('body-parser'),
  compression = require('compression'),
  cors = require('cors'),
  escapeHTML = require('escape-html'),
  express = require('express'),
  passport = require('passport'),
  path = require('node:path'),
  rateLimit = require('express-rate-limit'),
  session = require('express-session'),
  Strategy = require('passport-discord'),
  DBD = require('discord-dashboard'),
  DarkDashboard = require('dbd-dark-dashboard'),
  { HTTP_STATUS_MOVED_PERMANENTLY, HTTP_STATUS_FORBIDDEN, HTTP_STATUS_NOT_FOUND, HTTP_STATUS_INTERNAL_SERVER_ERROR, HTTP_STATUS_METHOD_NOT_ALLOWED } = require('node:http2').constants,
  VoteSystem = require('./Utils/VoteSystem.js'),
  DEFAULT_PORT = 8000,
  RATELIMIT_MAX_REQUESTS = 100,
  RATELIMIT_MS = 6e4, // 1min in ms
  MAX_COOKIE_AGE = 3.154e10; // 1y in ms

class WebServer {
  /**
   * @param {import('.').WebServer['client']}client
   * @param {import('.').WebServer['db']}db
   * @param {import('.').WebServer['keys']} keys
   * @param {import('.').WebServerConfig?}config
   * @param {import('.').WebServer['logError']}errorLoggingFunction */
  constructor(client, db, keys, config, errorLoggingFunction = console.error) {
    config ??= { support: {} };

    this.#checkConstructorParams(client, db, keys, config, errorLoggingFunction);

    this.client = client;
    this.db = db;
    this.logError = errorLoggingFunction;
    this.config = config;
    this.config.ownerIds ??= [];
    this.config.port ??= process.env.PORT ?? process.env.SERVER_PORT ?? DEFAULT_PORT;
    this.config.domain ??= process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost';
    if (!this.config.domain.startsWith('http')) this.config.domain = `http://${this.config.domain}`;

    this.config.baseUrl = config.port == undefined ? this.config.domain : this.config.domain + ':' + this.config.port;
    this.keys = keys;

    this.initiated = false;

    /* eslint-disable unicorn/no-null -- `null` is appropriate here */
    // properties set after this.init() ran
    this.passport = null;
    this.sessionStore = null;
    this.dashboardOptionCount = null;
    this.formTypes = null;
    this.dashboard = null;
    this.router = null;
    this.app = null;
    this.voteSystem = null;
    /* eslint-enable unicorn/no-null */
  }

  /** @returns {typeof import('.').WebServer} needed for better typing */
  get #class() {
    return this.constructor;
  }

  /**
   * @param {import('.').WebServer['client']?}client
   * @param {import('.').WebServer['db']?}db
   * @param {import('.').WebServer['keys']?} keys
   * @param {import('.').WebServerConfig?}config
   * @param {import('.').WebServer['logError']?}errorLoggingFunction
   * @throws {Error} on invalid data */
  #checkConstructorParams(client, db, keys, config, errorLoggingFunction) {
    if (!client?.options.intents.has(GatewayIntentBits.Guilds)) throw new Error('Client must have the "Guilds" gateway intent.');
    if (!db?.cache) throw new Error('Missing db property');
    if (!keys?.secret) throw new Error('Missing discord application secret');
    if (!keys.dbdLicense) throw new Error('Missing dbdLicense. Get one here: https://assistantscenter.com/discord-dashboard/v2');
    if (!config.domain.startsWith('http://') && !this.config.domain.startsWith('https://')) throw new Error('config.domain must start with "http://" or "https://"!');
    if (typeof errorLoggingFunction != 'function') throw new Error('Invalid errorLoggingFunction');
  }

  #setupPassport() {
    this.passport = passport.use(new Strategy({
      clientID: this.client.user.id,
      clientSecret: this.keys.secret,
      callbackURL: '/auth/discord/callback',
      scope: ['identify', 'guilds']
    }, (_accessToken, _refreshToken, user, done) => {
      // Compatibility with Discord-Dashboard
      user.tag = `${user.username}#${user.discriminator}`;
      /* eslint-disable-next-line unicorn/no-null -- `null` is appropriate here */
      user.avatarURL = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024` : null;

      done(undefined, user);
    }));

    this.passport.serializeUser((user, done) => done(undefined, user));
    this.passport.deserializeUser((user, done) => done(undefined, user));
  }

  #setupSessionStore() {
    this.sessionStore = new session.MemoryStore();
    this.sessionStore.get = (sid, cb) => {
      const data = this.db.get('website', `sessions.${sid}`);

      if (data?.user) {
        if (data.passport) data.passport.user = data.user;
        else data.passport = { user: data.user };
      }
      /* eslint-disable-next-line unicorn/no-null -- `null` must be used here */
      return cb(null, data);
    };
    this.sessionStore.set = async (sid, sessionData, cb) => {
      if (sessionData.passport?.user) {
        sessionData.user = sessionData.passport.user;

        delete sessionData.passport.user;
        if (!Object.keys(sessionData.passport).length) delete sessionData.passport;
      }

      await this.db.update('website', `sessions.${sid}`, sessionData);
      /* eslint-disable-next-line unicorn/no-null -- `null` must be used here */
      return cb(null);
    };
    this.sessionStore.destroy = (sid, cb) => this.db.delete('website', `sessions.${sid}`).then(() => cb?.());
  }

  async #getSettings() {
    /** @typedef {ConstructorParameters<ReturnType<import('discord-dashboard')['UpdatedClass']>>[0]['settings'][number]}category */
    /** @type {category[]} */
    const categoryOptionList = [];

    for (const subFolder of await readdir(this.config.settingsPath, { withFileTypes: true })) {
      if (!subFolder.isDirectory()) continue;

      const index = JSON.parse(await readFile(path.join(this.config.settingsPath, subFolder.name, '_index.json'), 'utf8'));

      /** @type {category['categoryOptionsList']} */
      const optionList = [{
        optionId: `${index.id}.spacer`,
        title: 'Important!',
        description: 'You need to press the submit button on the bottom of the page to save settings!',
        optionType: 'spacer',
        position: -1
      }];

      if (!index.disableToggle) {
        optionList.push({
          optionId: `${index.id}.enable`,
          optionName: 'Enable Module',
          optionDescription: 'Enable this Module',
          position: 0,
          optionType: DDB.formTypes.switch()
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
            optionType: setting.type,
            position: setting.position
          });
        }
        else {
          if (this.formTypes[setting.type]) setting.type = this.formTypes[setting.type];

          optionList.push({
            optionId: `${index.id}.${setting.id}`,
            optionName: setting.name,
            optionDescription: setting.description,
            optionType: typeof setting.type == 'function' ? await setting.type.call(this) : setting.type,
            position: setting.position,
            allowedCheck: ({ guild, user }) => {
              if (this.db.get('botSettings', 'blacklist').includes(user.id)) return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
              if (setting.auth === false) return { allowed: false, errorMessage: 'This feature has been disabled.' };
              return setting.auth?.(guild, user) ?? { allowed: true };
            }
          });
        }
      }

      categoryOptionList.push({
        categoryId: index.id,
        categoryName: index.name,
        categoryDescription: index.description,
        position: index.position,
        getActualSet: option => optionList.map(e => {
          if (e.get) return { optionId: e.optionId, data: e.get(option) };
          const dataPath = e.optionId.replaceAll(/[A-Z]/g, e => `.${e.toLowerCase()}`);
          if (dataPath.split('.').at(-1) == 'spacer') return { optionId: e.optionId, data: e.description };

          const data = this.db.get('guildSettings', `${option.guild.id}.${dataPath}`) ?? this.db.get('botSettings', `defaultGuild.${dataPath}`);
          return { optionId: e.optionId, data };
        }),
        setNew: async ({ guild, data: dataArray }) => {
          for (const { optionId, data } of dataArray) {
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

  /** @param {import('.').commands}commands */
  async #setupDashboard(commands) {
    this.dashboardOptionCount = [];

    await DBD.useLicense(this.keys.dbdLicense);

    /* eslint-disable-next-line new-cap -- UpdatedClass is none of mine (and, returns a class) */
    const DBDUpdated = DBD.UpdatedClass();
    this.dashboard = new DBDUpdated({
      port: this.config.port,
      domain: this.config.domain,
      acceptPrivacyPolicy: true,
      minimizedConsoleLogs: true,
      noCreateServer: true,
      useUnderMaintenance: false,
      useCategorySet: true,
      html404: this.config.errorPagesDir ? await readFile(path.join(this.config.errorPagesDir, '404.html'), 'utf8') : undefined,
      redirectUri: `${this.config.baseUrl}/discord/callback`,
      sessionStore: this.sessionStore,
      bot: this.client,
      ownerIDs: this.config.ownerIds,
      client: {
        id: this.client.user.id,
        secret: this.keys.secret
      },
      invite: {
        scopes: ['bot', 'applications.commands'],
        permissions: '412317240384'
      },

      /* theme: SoftUITheme({
           information: {
             createdBy: this.application.owner.tag,
             iconURL: this.user.displayAvatarURL(),
             websiteTitle: `${this.user.username} | Dashboard`,
             websiteName: `${this.user.username} | Dashboard`,
             websiteUrl: baseUrl,
             dashboardUrl: baseUrl,
             supporteMail: Support.Mail,
             supportServer: Support.Discord,
             imageFavicon: this.user.displayAvatarURL(),
             pageBackGround: 'linear-gradient(#2CA8FF, #155b8d)',
             preloader: 'Loading...',
             loggedIn: 'Successfully signed in.',
             mainColor: '#2CA8FF',
             subColor: '#ebdbdb'
           },
           index: {
             card: {
               category: `${this.user.username} Dashboard - The center of everything`,
               title: 'Welcome to the Teufelsbot dashboard where you can control the features and settings of the bot.',
               description: 'Look up commands and configurate servers on the left side bar!',
               image: 'https://i.imgur.com/axnP93g.png'
             },
             information: {},
             feeds: {},
           },
           commands
         }), */

      /* eslint-disable-next-line new-cap -- this is a function that does stuff a class usually does. */
      theme: DarkDashboard({
        information: {
          createdBy: this.client.application.owner.username,
          iconURL: this.client.user.displayAvatarURL(),
          websiteTitle: `${this.client.user.username} | Dashboard`,
          websiteName: `${this.client.user.username} | Dashboard`,
          websiteUrl: this.config.baseUrl,
          dashboardUrl: this.config.baseUrl,
          supporteMail: this.config.support.mail,
          supportServer: this.config.support.discord,
          imageFavicon: this.client.user.displayAvatarURL(),
          pageBackGround: 'linear-gradient(#2CA8FF, #155b8d)',
          preloader: 'Loading...',
          loggedIn: 'Successfully signed in.',
          mainColor: '#2CA8FF',
          subColor: '#ebdbdb'
        },
        index: {
          card: {
            category: `${this.client.user.username} Dashboard - The center of everything`,
            title: `Welcome to the ${this.client.user.username} dashboard where you can control the features and settings of the bot.`,
            description: 'Look up commands and configurate servers on the left side bar!',
            image: 'https://i.imgur.com/axnP93g.png'
          },
          information: {},
          feeds: {}
        },
        commands
      }),
      underMaintenance: {
        title: 'Under Maintenance',
        contentTitle: '<p id="content-title" style="color: #ddd9d9">This page is under maintenance</p>',
        texts: [
          '<br><p class="text" style="color: #ddd9d9">'
          + 'We still want to change for the better for you.<br>'
          + 'Therefore, we are introducing technical updates so that we can allow you to enjoy the quality of our services.'
          + '<br></p><br>'
        ],
        bodyBackgroundColors: ['#999', '#0f173d'],
        buildingsColor: '#6a6a6a',
        craneDivBorderColor: '#6a6a6a',
        craneArmColor: '#8b8b8b',
        craneWeightColor: '#8b8b8b',
        outerCraneColor: '#6a6a6a',
        craneLineColor: '#6a6a6a',
        craneCabinColor: '#8b8b8b',
        craneStandColors: ['#6a6a6a', undefined, '#f29b8b']
      },
      settings: this.settings
    });

    await this.dashboard.init();
  }

  #setupRouter = () => {
    /* eslint-disable-next-line new-cap -- Router is a function that returns a class */
    this.router = express.Router();
    this.router.all('*', asyncHandler(async (req, res, next) => {
      Object.defineProperty(req.session, 'guilds', { // Dashboard
        get() { return this.user?.guilds; },
        set(val) {
          this.user ??= {};
          this.user.guilds = val;
        }
      });

      if (req.path === '/') return res.redirect('/home');
      if (req.path.startsWith('/api/') && !/^\/api\/v\d+\//i.test(req.path.endsWith('/') ? req.path : req.path + '/')) return res.redirect(req.path.replace('/api/', '/api/v1/'));
      if (req.path == '/dashboard') return res.redirect(HTTP_STATUS_MOVED_PERMANENTLY, '/manage');
      if (req.path == '/callback') { // Dashboard
        if (req.query.code != undefined) req.session.user.accessToken = req.query.code;
        return next();
      }
      if (req.path == '/guilds/reload') { // Dashboard
        /* eslint-disable new-cap */
        if (req.session.user?.accessToken && !req.AssistantsSecureStorage.GetUser(req.session.user.id))
          req.AssistantsSecureStorage.SaveUser(req.session.user.id, req.session.user.accessToken);
        /* eslint-enable new-cap */
        return next();
      }

      const
        pathStr = path.join(process.cwd(), this.config.customPagesPath, path.normalize(req.path.endsWith('/') ? req.path.slice(0, -1) : req.path).replace(/^(?:\.{2}(?:\/|\\|$))+/, '')),
        dir = pathStr.slice(0, Math.max(0, pathStr.lastIndexOf(path.sep)));

      /** @type {import('.').customPage?} */
      let data, subDirs;
      try { subDirs = await readdir(dir, { withFileTypes: true }); }
      catch { /* empty */ }

      if (subDirs) {
        const filename = subDirs.find(e => {
          if (!e.isFile()) return false;

          const file = pathStr.slice(pathStr.lastIndexOf(path.sep) + 1);
          return file.includes('.') ? e.name.startsWith(`${file}.`) : e.name.startsWith(file);
        })?.name;

        if (!filename) {
          const html = await this.#class.createNavigationButtons(pathStr, req.path);
          return void (html ? res.send(html) : next());
        }

        if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
        data = await require(path.join(dir, filename));
      }

      if (!data) return next();
      if (data.method != undefined && (Array.isArray(data.method) && data.method.some(e => e.toUpperCase() == req.method) || data.method.toUpperCase() !== req.method))
        return res.setHeader('Allow', data.method.join?.(',') ?? data.method).sendStatus(HTTP_STATUS_METHOD_NOT_ALLOWED);
      if (data.permissionCheck && !await data.permissionCheck.call(req)) return res.redirect(HTTP_STATUS_FORBIDDEN, `/error/${HTTP_STATUS_FORBIDDEN}`);
      if (data.title) res.set('title', data.title);
      if (data.static) {
        const code = String(data.run);
        return res.send(code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')));
      }
      if (typeof data.run == 'function') return data.run.call(this, res, req, next);
      if (data.run instanceof URL) return res.redirect(data.run.toString());

      return res.send(JSON.stringify(data.run ?? data));
    }));
  };

  /**
   * @param {Error | import('http-errors').HttpError}err
   * @param {import('express').Request}req
   * @param {import('express').Response}res
   * @param {import('express').NextFunction}next */
  #reqErrorHandler = (err, req, res, next) => {
    if (err.code != 'ENOENT') this.logError(err);

    // send html only to browser
    if (this.config.errorPagesDir && req.headers['user-agent']?.includes('Mozilla')) {
      const filePath = path.join(this.config.errorPagesDir, `${err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR}.html`);

      try {
        res.status(err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR).sendFile(filePath, { root: process.cwd() }); return;
      }
      catch (err) {
        if (err.code != 'ENOENT') return this.#reqErrorHandler(err, req, res, next);
      }
    }

    return res.sendStatus(err.statusCode ?? HTTP_STATUS_INTERNAL_SERVER_ERROR);
  };

  #setupApp() {
    this.app = express()
      .disable('x-powered-by')
      .set('json spaces', 2)
      .set('title', this.client.user.username)
      .use(
        compression(),
        rateLimit({
          windowMs: RATELIMIT_MS,
          max: RATELIMIT_MAX_REQUESTS,
          message: '<body style="background-color:#111;color:#ff0000"><p style="text-align:center;top:50%;position:relative;font-size:40;">Sorry, you have been ratelimited!</p></body>'
        }),
        bodyParser.json({ limit: '100kb' }),
        bodyParser.urlencoded({ extended: true, limit: '100kb' }),
        xss(),
        session({
          name: 'sessionId',
          secret: this.keys.secret,
          resave: false,
          saveUninitialized: false,
          store: this.sessionStore,
          cookie: {
            maxAge: MAX_COOKIE_AGE,
            secure: this.config.domain.startsWith('https'),
            httpOnly: this.config.domain.startsWith('https'),
            sameSite: 'lax',
            path: '/'
          }
        }),
        passport.initialize(),
        passport.session()
      )
      .use('/api/:v/internal', cors({ origin: this.config.baseUrl }))
      .use(
        this.router,
        this.dashboard.getApp(),
        this.#reqErrorHandler,
        (req, res) => {
          if (this.config.errorPagesDir && req.headers['user-agent']?.includes('Mozilla'))
            return res.status(HTTP_STATUS_NOT_FOUND).sendFile(path.join(this.config.errorPagesDir, `${HTTP_STATUS_NOT_FOUND}.html`), { root: process.cwd() });
          res.sendStatus(HTTP_STATUS_NOT_FOUND);
        }
      );
  }

  /** @type {import('.').WebServer['init']} */
  async init(commands) {
    while (this.client.ws.status != Status.Ready) await new Promise(res => setTimeout(res, 10));
    await this.client.application.fetch();

    if (this.initiated) throw new Error('Already initiated');

    this.formTypes = {
      ...DBD.formTypes, _embedBuilder: DBD.formTypes.embedBuilder, embedBuilder: DBD.formTypes.embedBuilder({
        username: this.client.user.username,
        avatarURL: this.client.user.displayAvatarURL({ forceStatic: true }),
        defaultJson: {}
      })
    };

    this.#setupPassport();
    this.#setupSessionStore();
    this.settings = await this.#getSettings();

    await this.#setupDashboard(commands);
    this.#setupRouter();
    this.#setupApp();

    this.voteSystem = new VoteSystem(this.client, this.db, this.config);

    this.app.listen(this.config.port, () => { console.log(`Website is online on ${this.config.baseUrl}.`); });

    this.initiated = true;
    return this;
  }

  valueOf() {
    return `WebServer on ${this.config.baseUrl}`; // Prevents recursion with discord.js Client#toJSON()
  }

  /** @type {typeof import('.').WebServer['createNavigationButtons']} */
  static async createNavigationButtons(dirPath, reqPath) {
    const dir = await readdir(dirPath, { withFileTypes: true }).catch(() => { /* emtpy */ });
    if (!dir) return;

    return dir.reduce((acc, file) => {
      const name = file.isFile() ? file.name.split('.').slice(0, -1).join('.') : file.name;

      let title;
      try { title = require(path.join(dirPath, file.name))?.title; }
      catch { /** handled by `title ??=` */ }

      title ??= name[0].toUpperCase() + name.slice(1).replaceAll(/[-_]/g, ' ');

      // '//' can be on dirs and on the `reqPath`'s start
      return `${acc}<a href=${escapeHTML('/' + reqPath + '/' + name).replaceAll('//', '/')}>${escapeHTML(title)}</a>`;
    }, '<link rel="stylesheet" href="https://mephisto5558.github.io/Website-Assets/min/css/navButtons.css" crossorigin="anonymous" /><div class="navButton">') + '</div>';
  }
}

module.exports = { WebServer, default: WebServer };