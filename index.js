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

  VoteSystem = require('./Utils/VoteSystem.js');
class WebServer {
  constructor(client, db, keys, config, errorLoggingFunction = console.error) {
    config ??= { support: {} };

    this.client = client;
    this.db = db;
    this.logError = errorLoggingFunction;
    this.config = config;
    this.config.port ??= process.env.PORT ?? process.env.SERVER_PORT ?? 8000;
    this.config.domain ??= process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost';
    if (!this.config.domain.startsWith('http')) this.config.domain = `http://${this.config.domain}`;

    this.config.baseUrl = config.port ? this.config.domain + ':' + this.config.port : this.config.domain;
    this.keys = keys;

    this.#checkConstructorParams();

    this.initiated = false; // set to true once this.init() ran

    /* eslint-disable unicorn/no-null */
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

  #checkConstructorParams() {
    if (!this.client?.options?.intents?.has(GatewayIntentBits.Guilds)) throw new Error('Client must have the "Guilds" gateway intent.');
    if (!this.db?.cache) throw new Error('Missing db property');
    if (!this.keys?.secret) throw new Error('Missing discord application secret');
    if (!this.keys?.dbdLicense) throw new Error('Missing dbdLicense. Get one here: https://assistantscenter.com/discord-dashboard/v2');
    if (!this.config.domain.startsWith('http://') && !this.config.domain.startsWith('https://')) throw new Error('config.domain must start with "http://" or "https://"!');
  }

  #setupPassport() {
    this.passport = passport.use(new Strategy({
      clientID: this.client.user.id,
      clientSecret: this.keys.secret,
      callbackURL: '/auth/discord/callback',
      scope: ['identify']
    }, (_accessToken, _refreshToken, user, done) => done(undefined, user)));

    this.passport.serializeUser((user, done) => done(undefined, {
      id: user.id, username: user.username,
      locale: user.locale, avatar: user.avatar, banner: user.banner
    }));

    this.passport.deserializeUser((user, done) => done(undefined, user));
  }

  #setupSessionStore() {
    this.sessionStore = new session.MemoryStore();
    /* eslint-disable-next-line unicorn/no-null */
    this.sessionStore.get = (sid, cb) => cb(null, this.client.db.get('website', `sessions.${sid}`));
    this.sessionStore.set = async (sid, sessionData, cb) => {
      if (sessionData.passport?.user?.id)
        await this.db.update('website', 'sessions', Object.fromEntries(Object.entries(this.db.get('website', 'sessions')).filter(([, e]) => e.passport?.user?.id != sessionData.passport.user.id)));
      await this.db.update('website', `sessions.${sid}`, sessionData);

      /* eslint-disable-next-line unicorn/no-null */
      cb(null);
    };
    this.sessionStore.destroy = (sid, cb) => this.db.delete('website', `sessions.${sid}`).then(() => cb?.());
  }

  async #getSettings() {
    const categoryOptionList = [];

    for (const subFolder of await readdir(this.config.settingsPath, { withFileTypes: true })) {
      if (!subFolder.isDirectory()) continue;

      const index = JSON.parse(await readFile(path.join(this.config.settingsPath, subFolder.name, '_index.json'), 'utf8'));
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

        /** @type {import('.').dashboardSetting}*/
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
          optionList.push({
            optionId: `${index.id}.${setting.id}`,
            optionName: setting.name,
            optionDescription: setting.description,
            optionType: typeof (this.formTypes[setting.type] ?? setting.type) == 'function' ? await (this.formTypes[setting.type] ?? setting.type).call(this) : setting.type,
            position: setting.position,
            allowedCheck: ({ guild, user }) => {
              if (this.db.get('botSettings', 'blacklist')?.includes(user.id)) return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
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
        getActualSet: ({ guild }) => optionList.map(e => {
          /* eslint-disable-next-line prefer-rest-params */
          if (e.get) return { optionId: e.optionId, data: e.get(arguments) };
          const items = e.optionId.replaceAll(/([A-Z])/g, e => `.${e.toLowerCase()}`).split('.');
          if (items.at(-1) == 'spacer') return { optionId: e.optionId, data: e.description };

          const data = items.reduce((acc, e) => acc?.[e], this.db.get('guildSettings', guild.id)) ?? items.reduce((acc, e) => acc?.[e], this.db.get('guildSettings', 'default'));
          return { optionId: e.optionId, data };
        }),
        setNew: ({ guild, data: dataArray }) => {
          let guildSettings = this.db.get('guildSettings');

          for (const { optionId, data } of dataArray) {
            if (data.embed && !data.embed.description) data.embed.description = ' ';

            const nestedObj = optionId.split('.').reduceRight((obj, key) => ({ [key]: obj }), data);
            const parsedObj = JSON.parse(JSON.stringify(nestedObj));

            guildSettings = { ...guildSettings, [guild.id]: parsedObj };
          }

          return this.db.set('guildSettings', guildSettings);
        },
        // optionList is never used again so idc about it being mutated and Array#toSorted doesn't exist in Node 18
        categoryOptionsList: optionList.sort((a, b) => a.position - b.position) // NOSONAR
      });
    }

    return categoryOptionList.sort((a, b) => a.position - b.position);
  }

  /** @param {import('.').commands}commands */
  async #setupDashboard(commands) {
    this.dashboardOptionCount = [];

    await DBD.useLicense(this.keys.dbdLicense);

    const DBDUpdated = DBD.UpdatedClass()
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
      bot: this.client,
      ownerIDs: [this.client.application.owner.id],
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

      /* eslint-disable-next-line new-cap */
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
    /* eslint-disable-next-line new-cap */
    this.router = express.Router();
    this.router.all('*', asyncHandler(async (req, res, next) => {
      if (req.path === '/') return res.redirect('/home');
      if (req.path.startsWith('/api/') && !/^\/api\/v\d+\//i.test(req.path.endsWith('/') ? req.path : req.path + '/')) res.redirect(req.path.replace('/api/', '/api/v1/'));
      if (req.path == '/dashboard') return res.redirect(301, '/manage');

      const
        pathStr = path.join(process.cwd(), this.config.customPagesPath, path.normalize(req.path.endsWith('/') ? req.path.slice(0, -1) : req.path).replace(/^(\.\.(\/|\\|$))+/, '')),
        dir = pathStr.slice(0, Math.max(0, pathStr.lastIndexOf(path.sep))),
        /* eslint-disable-next-line no-empty-function */
        subDirs = await readdir(dir, { withFileTypes: true }).catch(() => { });

      /** @type {import('.').customPage?}*/
      let data;

      if (subDirs) {
        const filename = subDirs.find(e => {
          const file = pathStr.slice(pathStr.lastIndexOf(path.sep) + 1);
          return +file.includes('.') ? e.name.startsWith(file) : e.name.startsWith(`${file}.`);
        })?.name;

        if (!filename || !subDirs.some(e => e.isFile() && e.name == filename)) {
          const html = await this.constructor.createNavigationButtons(subDirs, pathStr, req.path);
          return html ? res.send(html) : next();
        }

        if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
        data = await require(path.join(dir, filename));
      }

      if (!data) return next();
      if (data.method && (Array.isArray(data.method) && data.method.some(e => e.toUpperCase() == req.method) || data.method.toUpperCase() !== req.method))
        return res.setHeader('Allow', data.method.join?.(',') ?? data.method).sendStatus(405);
      if (data.permissionCheck && !await data.permissionCheck.call(req)) return res.redirect(403, '/error/403');
      if (data.title) res.set('title', data.title);
      if (data.static) {
        const code = String(data.run);
        return res.send(code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')));
      }
      if (typeof data.run == 'function') return data.run.call(this, res, req, next);
      return res.send(JSON.stringify(data.run ?? data));
    }));
  };

  #setupApp() {
    this.app = express()
      .disable('x-powered-by')
      .set('json spaces', 2)
      .set('title', this.client.user.username)
      .use(
        compression(),
        rateLimit({
          windowMs: 6e4, // 1min
          max: 100,
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
            maxAge: 3.154e10, // 356 days
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
        (err, req, res, next) => {
          this.logError(err);
          if (res.headersSent) {
            try { return next(err); }
            /* eslint-disable-next-line no-empty */
            catch { }
          }
          // send html only to browser
          if (this.config.errorPagesDir && req.headers?.['user-agent']?.includes('Mozilla'))
            return res.status(500).sendFile(path.join(this.config.errorPagesDir, '500.html'), { root: process.cwd() });
          res.sendStatus(500);
        },
        (req, res) => {
          if (this.config.errorPagesDir && req.headers?.['user-agent']?.includes('Mozilla'))
            return res.status(404).sendFile(path.join(this.config.errorPagesDir, '404.html'), { root: process.cwd() });
          res.sendStatus(404);
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

    this.voteSystem = new VoteSystem(this.client, this.db, this.config.baseUrl, this.keys.webhookURL);

    this.app.listen(this.config.port, () => console.log(`Website is online on ${this.config.baseUrl}.`));

    this.initiated = true;
    return this;
  }

  /** @type {typeof import('.').WebServer['createNavigationButtons']} */
  static async createNavigationButtons(dir, pathStr, reqPath) {
    if (!dir.some(e => e.isDirectory() && e.name == path.basename(reqPath))) return;

    return (await readdir(pathStr, { withFileTypes: true })).reduce((acc, file) => {
      const name = escapeHTML(file.isFile() ? file.name.split('.').slice(0, -1).join('.') : file.name);
      const title = require(path.join(pathStr, file.name))?.title ?? name[0].toUpperCase() + name.slice(1).replaceAll(/[_-]/g, ' ');

      return acc + `<a href='./${escapeHTML(path.basename(reqPath)) + '/' + name}'>` + escapeHTML(title) + '</a>';
    }, '<link rel="stylesheet" href="https://mephisto5558.github.io/Website-Assets/min/css/navButtons.css" crossorigin="anonymous" /><div class="navButton">') + '</div>';
  }
}

module.exports = { WebServer, default: WebServer };