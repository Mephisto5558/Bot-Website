const
  { readdir } = require('node:fs/promises'),
  path = require('node:path'),
  { HTTP_STATUS_MOVED_PERMANENTLY, HTTP_STATUS_FORBIDDEN, HTTP_STATUS_NOT_FOUND, HTTP_STATUS_METHOD_NOT_ALLOWED } = require('node:http2').constants,
  { OAuth2Scopes } = require('discord.js'),
  { Authenticator } = require('passport'),
  Strategy = require('passport-discord'),
  DBD = require('discord-dashboard'),
  /** @type {(config: import('dbd-soft-ui').themeConfig) => unknown}*/SoftUITheme = require('dbd-soft-ui'),
  asyncHandler = require('express-async-handler'),
  express = require('express'),
  escapeHTML = require('escape-html'),
  { xss } = require('express-xss-sanitizer'),
  bodyParser = require('body-parser'),
  compression = require('compression'),
  cors = require('cors'),
  rateLimit = require('express-rate-limit'),
  session = require('express-session'),

  RATELIMIT_MAX_REQUESTS = 100,
  RATELIMIT_MS = 6e4, // 1min in ms
  MAX_COOKIE_AGE = 3.154e10; // 1y in ms


module.exports = class WebServerSetupper {
  client; authenticator; dashboardTheme; dashboard; router;

  /**
   * @param {import('discord.js').Client<true>}client
   * @param {ConstructorParameters<typeof import('.').WebServerSetupper>[1]}baseConfig */
  constructor(client, baseConfig) {
    this.client = client;
    this.baseConfig = baseConfig;
  }

  /** @type {import('.').WebServerSetupper['setupAuth']} */
  setupAuth(callbackURL = '/auth/discord/callback') {
    this.authenticator = new Authenticator().use(
      new Strategy(
        {
          callbackURL,
          clientSecret: this.baseConfig.clientSecret,
          clientID: this.client.user.id,
          scope: [OAuth2Scopes.Identify, OAuth2Scopes.Guilds]
        },
        (_accessToken, _refreshToken, user, done) => done(undefined, user)
      )
    );

    this.authenticator.serializeUser((user, done) => done(undefined, user));
    this.authenticator.deserializeUser((user, done) => done(undefined, user));

    return this.authenticator;
  }

  /** @type {import('.').WebServerSetupper['setupDashboardTheme']} */
  setupDashboardTheme(config) {
    /* eslint-disable-next-line new-cap */
    this.dashboardTheme = SoftUITheme({
      websiteName: `${this.client.user.username} | Dashboard`,
      colorScheme: 'dark',
      icons: {
        favicon: this.client.user.displayAvatarURL(),
        sidebar: {
          darkUrl: this.client.user.displayAvatarURL(),
          lightUrl: this.client.user.displayAvatarURL()
        }
      },
      preloader: {},
      index: {
        graph: {
          enabled: true,
          lineGraph: false,
          title: 'Memory Usage',
          tag: 'Memory (MB)',
          max: 100
        }
      },
      admin: {
        pterodactyl: {
          enabled: true,
          apiKey: 'ptlc_ci9V0fmFFN4amkjryiOY5kUNNcVGO5fWbaxQCjkHSDD', // todo
          panelLink: 'https://pro.pylexnodes.net/',
          serverUUIDs: ['029987ba-215c-4c04-bf71-e27b29c102ac']
        }
      },
      meta: {
        author: (this.client.application.owner.owner ?? this.client.application.owner).username,
        owner: (this.client.application.owner.owner ?? this.client.application.owner).username
      },
      commands: config.commands
    });

    return this.dashboardTheme;

    /*
      information: {
           supportServer: Support.Discord,
         },
      index: {
           card: {
             category: `${this.client.user.username} Dashboard - The center of everything`,
             title: `Welcome to the ${this.client.user.username} dashboard where you can control the features and settings of the bot.`,
             description: 'Look up commands and configurate servers on the left side bar!',
             image: 'https://i.imgur.com/axnP93g.png'
           }
         }, */

    // this.dashboardTheme = DarkDashboard({
    //   information: {
    //     websiteUrl: this.baseConfig.baseURL,
    //     dashboardUrl: this.baseConfig.baseURL,
    //     /* eslint-disable-next-line @typescript-eslint/no-magic-numbers -- 4th smallest size */
    //     pageBackGround: 'linear-gradient(#2CA8FF, #155b8d)',
    //     preloader: 'Loading...',
    //     loggedIn: 'Successfully signed in.',
    //     mainColor: '#2CA8FF',
    //     subColor: '#ebdbdb',
    //     ...config.information
    //   },
    //   index: {
    //     card: {
    //       category: `${this.client.user.username} Dashboard - The center of everything`,
    //       title: `Welcome to the ${this.client.user.username} dashboard where you can control the features and settings of the bot.`,
    //       description: 'Look up commands and configurate servers on the left side bar!',
    //       image: 'https://i.imgur.com/axnP93g.png'
    //     },
    //     ...config.index
    //   },
    //   commands: config.commands
    // });
  }

  /** @type {import('.').WebServerSetupper['setupDashboard']} */
  async setupDashboard(licenseId, config) {
    await DBD.useLicense(licenseId);

    /* eslint-disable-next-line new-cap -- UpdatedClass is none of mine (and, returns a class) */
    const DBDUpdated = DBD.UpdatedClass();

    this.dashboard = new DBDUpdated({
      acceptPrivacyPolicy: true,
      minimizedConsoleLogs: true,
      redirectUri: '/discord/callback', // it's always this, but is still required to be configured
      noCreateServer: true,
      useUnderMaintenance: false,
      useCategorySet: true,
      useTheme404: true,
      bot: this.client,
      client: {
        id: this.client.user.id,
        secret: this.baseConfig.clientSecret
      },
      invite: {
        scopes: this.client.application.installParams.scopes,
        permissions: this.client.application.installParams.permissions
      },
      theme: this.dashboardTheme,
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
      ...config
    });

    await this.dashboard.init();
    return this.dashboard;
  }

  /** @type {import('.').WebServerSetupper['setupRouter']} */
  setupRouter(customPagesPath, webServer) {
    /* eslint-disable-next-line new-cap -- Router is a function that returns a class */
    this.router = express.Router();
    this.router.all('*', asyncHandler(async (req, res, next) => {
      Object.defineProperty(req.session, 'guilds', { // Dashboard
        /** @this {import('express-session')['Session'] & { user?: import('.').session['user'] }} */
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
      if (!customPagesPath) return next();

      const
        pathStr = path.join(process.cwd(), customPagesPath, path.normalize(req.path.endsWith('/') ? req.path.slice(0, -1) : req.path).replace(/^(?:\.{2}(?:\/|\\|$))+/, '')),
        dir = pathStr.slice(0, Math.max(0, pathStr.lastIndexOf(path.sep)));

      let /** @type {import('..').customPage | undefined} */data, subDirs;
      try { subDirs = await readdir(dir, { withFileTypes: true }); }
      catch { /* empty */ }

      if (subDirs) {
        const filename = subDirs.find(e => {
          if (!e.isFile()) return false;

          const file = pathStr.slice(pathStr.lastIndexOf(path.sep) + 1);
          return file.includes('.') ? e.name.startsWith(`${file}.`) : e.name.startsWith(file);
        })?.name;

        if (!filename) {
          const html = await WebServerSetupper.createNavigationButtons(pathStr, req.path);
          return void (html ? res.send(html) : next());
        }

        if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
        data = await require(path.join(dir, filename));
      }

      return this.#handleCustomSite.call(webServer, req, res, next, data);
    }));

    return this.router;
  }

  /** @type {import('.').WebServerSetupper['setupApp']} */
  setupApp(secret, sessionStore, handlers = [], config = {}) {
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
          secret,
          name: 'sessionId',
          resave: false,
          saveUninitialized: false,
          store: sessionStore,
          cookie: {
            maxAge: MAX_COOKIE_AGE,
            secure: config.domain?.startsWith('https'),
            httpOnly: config.domain?.startsWith('https'),
            sameSite: 'lax',
            path: '/'
          }
        }),
        this.authenticator.initialize(),
        this.authenticator.session()
      )
      .use('/api/:v/internal', cors({ origin: this.baseConfig.baseURL }))
      .use(
        ...handlers,
        (req, res) => {
          if (config.errorPagesDir && req.headers['user-agent']?.includes('Mozilla'))
            return res.status(HTTP_STATUS_NOT_FOUND).sendFile(path.join(config.errorPagesDir, `${HTTP_STATUS_NOT_FOUND}.html`), { root: process.cwd() });
          res.sendStatus(HTTP_STATUS_NOT_FOUND);
        }
      );

    return this.app;
  }

  /**
   * @param {express.Request}req
   * @param {express.Response}res
   * @param {express.NextFunction}next
   * @param {import('..').customPage | undefined}data */
  async #handleCustomSite(req, res, next, data) {
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
  }

  /** @type {typeof import('..').WebServer['createNavigationButtons']} */
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
};