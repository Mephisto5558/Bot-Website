const
  { readdir } = require('node:fs/promises'),
  path = require('node:path'),
  { HTTP_STATUS_OK, HTTP_STATUS_MOVED_PERMANENTLY, HTTP_STATUS_FORBIDDEN, HTTP_STATUS_NOT_FOUND, HTTP_STATUS_METHOD_NOT_ALLOWED } = require('node:http2').constants,
  { Authenticator } = require('passport'),
  { Strategy, Scope } = require('passport-discord-auth'),
  DBD = require('discord-dashboard'),
  /** @type {(config: import('dbd-soft-ui').themeConfig) => unknown} */ SoftUITheme = require('dbd-soft-ui'),
  express = require('express'),
  escapeHTML = require('escape-html'),
  { xss } = require('express-xss-sanitizer'),
  compression = require('compression'),
  cors = require('cors'),
  rateLimit = require('express-rate-limit'),
  session = require('express-session'),

  RATELIMIT_MAX_REQUESTS = 100,
  RATELIMIT_MS = 6e4, // 1min in ms
  MAX_COOKIE_AGE = 3.154e10, // 1y in ms
  VIEW_COOLDOWN_MS = 3e5; // 5min in ms

module.exports.WebServerSetupper = class WebServerSetupper {
  client; db; dashboardTheme; dashboard; router;

  /**
   * @param {ConstructorParameters<typeof import('.').WebServerSetupper>[0]} client
   * @param {ConstructorParameters<typeof import('.').WebServerSetupper>[1]} db
   * @param {ConstructorParameters<typeof import('.').WebServerSetupper>[2]} baseConfig */
  constructor(client, db, baseConfig) {
    this.client = client;
    this.db = db;
    this.baseConfig = baseConfig;
  }

  /** @type {import('.').WebServerSetupper['setupAuth']} */
  setupAuth(authUrl = '/auth/discord', callbackUrl = '/auth/discord/callback') {
    this.authUrl = authUrl;
    this.callbackUrl = callbackUrl;

    this.authenticator = new Authenticator().use(
      new Strategy(
        {
          clientId: this.client.user.id,
          clientSecret: this.baseConfig.clientSecret,
          callbackUrl: this.callbackUrl,
          scope: [Scope.Identify, Scope.Guilds]
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
      meta: {
        author: (this.client.application.owner.owner ?? this.client.application.owner).username,
        owner: (this.client.application.owner.owner ?? this.client.application.owner).username
      },
      ...config
    });

    return this.dashboardTheme;
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
    const router = express.Router();
    router.use(async (req, res, next) => {
      Object.defineProperty(req.session, 'guilds', { // Dashboard
        /** @this {import('express-session')['Session'] & { user?: import('.').session['user'] }} */
        get() { return this.user?.guilds; },
        set(val) {
          this.user ??= {};
          this.user.guilds = val;
        }
      });

      if (req.path === '/') return res.redirect('/home');
      if (req.path.startsWith('/api/')) {
        const pathParts = req.path.split(/\/+/);
        if (!/^v\d+$/.test(pathParts[2]))
          return res.redirect(HTTP_STATUS_MOVED_PERMANENTLY, `/api/v${this.baseConfig.defaultAPIVersion}/${pathParts.slice(2).join('/')}`);
      }
      if (req.path == '/dashboard') return res.status(HTTP_STATUS_MOVED_PERMANENTLY).redirect('/manage');
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
        absoluteCustomPagesPath = path.resolve(process.cwd(), customPagesPath),
        parsedPath = path.parse(path.resolve(absoluteCustomPagesPath, path.normalize('.' + req.path)));

      if (parsedPath.dir != absoluteCustomPagesPath && !parsedPath.dir.startsWith(absoluteCustomPagesPath + path.sep))
        return res.sendStatus(HTTP_STATUS_FORBIDDEN);

      let
        /** @type {import('..').customPage | undefined} */ data,
        /** @type {import('fs').Dirent[] | undefined} */ subDirs;
      try { subDirs = await readdir(parsedPath.dir, { withFileTypes: true }); }
      catch { /* empty */ }

      if (subDirs?.length) {
        const subDir = subDirs.find(e => e.isFile() && e.name == parsedPath.base)
          ?? subDirs
            .filter(e => e.isFile() && path.parse(e.name).name.startsWith(parsedPath.name))
            .toSorted((a, b) => {
              a = path.parse(a);
              b = path.parse(b);

              return Number(b.name == parsedPath.name) - Number(a.name == parsedPath.name)
                || Number(b.ext == '.html') - Number(a.ext == '.html')
                || a.name.localeCompare(b.name);
            })[0];

        if (!subDir) {
          const html = await WebServerSetupper.createNavigationButtons(path.join(parsedPath.dir, parsedPath.name), req.path);
          return void (html ? res.send(html) : next());
        }

        if (!subDir.name.endsWith('.js')) return res.sendFile(path.join(subDir.path, subDir.name));
        data = await require(path.join(subDir.path, subDir.name));
      }

      return this.#handleCustomSite.call(webServer, req, res, next, data);
    });

    this.router = router;
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
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
          }
        }),
        this.authenticator.session()
      )
      .use('/api/:v/internal', cors({ origin: this.baseConfig.baseUrl }))
      .use(this.authUrl, (req, res, next) => this.authenticator.authenticate('discord', {
        failureRedirect: this.authUrl,
        successRedirect: 'redirectUrl' in req.query ? req.query.redirectUrl : '/'
      })(req, res, next))
      .use('/auth/logout', (req, res, next) => req.logOut(err => err ? next(err) : res.sendStatus(HTTP_STATUS_OK)))
      .use(
        (req, _, next) => {
          // only track normal GET requests
          if (!req.user?.id || req.method != 'GET' || req.xhr || req.accepts('html') === false) return next();

          const pagePath = req.path.split('/').filter(Boolean).join('.') || 'root';
          const viewData = this.db.get('userSettings', `${req.user.id}.pageViews.${pagePath}`);
          const now = new Date();

          if (!viewData?.lastVisited || now.getTime() - viewData.lastVisited.getTime() > VIEW_COOLDOWN_MS)
            void this.db.update('userSettings', `${req.user.id}.pageViews.${pagePath}`, { count: (viewData?.count ?? 0) + 1, lastVisited: now });

          return next();
        },
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
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {express.NextFunction} next
   * @param {import('..').customPage | undefined} data */
  #handleCustomSite(req, res, next, data) {
    if (!data) return next();

    /* eslint-disable-next-line @typescript-eslint/no-shadow */
    return WebServerSetupper.runParsed(req, res, next, data, async (req, res, data) => {
      if (data.method != undefined && (Array.isArray(data.method) && !data.method.some(e => e.toUpperCase() == req.method) || data.method.toUpperCase() !== req.method))
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
    });
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
      return `${acc}<a href="${path.posix.join(reqPath, encodeURIComponent(name))}">${escapeHTML(title)}</a>`;
    }, '<link rel="stylesheet" href="https://mephisto5558.github.io/Website-Assets/min/css/navButtons.css" crossorigin="anonymous" /><div class="navButton">') + '</div>';
  }

  /** @type {typeof import('..').WebServer['runParsed']} */
  static runParsed(req, res, next, data, fn) {
    return express.json({ limit: '100kb' })(req, res, err => {
      if (err) return next(err);

      return express.urlencoded({ extended: true, limit: '100kb' })(req, res, err => {
        if (err) return next(err);
        return fn(req, res, data);
      });
    });
  }
};
module.exports.MongoStore = require('./sessionStore.js');