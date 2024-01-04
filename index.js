const
  bodyParser = require('body-parser'),
  compression = require('compression'),
  cors = require('cors'),
  createDashboard = require('./dashboard.js'),
  debug = require('debug'),
  escapeHTML = require('escape-html'),
  express = require('express'),
  path = require('path'),
  passport = require('passport'),
  rateLimit = require('express-rate-limit'),
  session = require('express-session'),
  Strategy = require('passport-discord'),
  { appendFile, readdir } = require('fs/promises'),
  { DB } = require('@mephisto5558/mongoose-db'),
  { GatewayIntentBits, Status, Client } = require('discord.js'),
  { inspect } = require('util'),
  { xss } = require('express-xss-sanitizer'),
  VoteSystem = require('./Utils/VoteSystem.js');

debug.log = console.debug.bind(console);

module.exports = WebServer;
class WebServer {
  /**
   * @param {import('discord.js').Client}client @param {DB}db Database from @mephisto5558/mongoose-db
   * @param {{ support?: object, port?: number, domain?: string }}config
   */
  constructor(
    client, db, keys, config = {
      support: {},
      port: process.env.PORT ?? process.env.SERVER_PORT ?? 8000,
      domain: process.env.SERVER_IP || process.env.IP || `http://localhost:${port}`
    }
  ) {
    this.client = client;
    this.db = db;
    this.config = config;
    this.keys = keys;

    this.initiated = false; // set to true once this.init() ran

    this.#checkConstructorParams();

    this.#setupPassport();
    this.#setupSessionStore();
    this.#setupRouter();
    this.#setupApp();
  }

  #checkConstructorParams() {
    if (!(this.client instanceof Client)) throw new Error('client must be instanceof discord.js#Client');
    if (!this.client.options.intents.has(GatewayIntentBits.Guilds)) throw new Error('Client must have the "Guilds" gateway intent.');
    if (!this.db) throw new Error('Missing db property');
    if (!(this.db instanceof DB)) throw new Error('client.db property must be instanceof @mephisto5558/mongoose-db#DB');
    if (!/^https?:\/\//.test(this.config.domain))
      throw new Error('Invalid domain param. Must start with "http://" or "https://"!');
  }

  #setupPassport() {
    passport.serializeUser((user, done) => done(null, {
      id: user.id, username: user.username,
      locale: user.locale, avatar: user.avatar, banner: user.banner
    }));
    passport.deserializeUser((user, done) => done(null, user));

    passport.use(new Strategy({
      clientID: this.client.user.id,
      clientSecret: this.keys.secret,
      callbackURL: `${this.domain}/auth/discord/callback`,
      scope: ['identify']
    }, async (_accessToken, _refreshToken, user, done) => done(null, user)));
  }

  #setupSessionStore() {
    this.sessionStore = new session.MemoryStore();
    this.sessionStore.get = async (sid, cb) => this.client.db.get('website', `sessions.${sid}`).then(e => cb(null, e));
    this.sessionStore.set = async (sid, session, cb) => {
      if (session.passport?.user?.id)
        await this.db.update('website', 'sessions', Object.fromEntries(Object.entries(this.db.get('website', 'sessions')).filter(([, e]) => e.passport?.user?.id != session.passport.user.id)));
      await this.db.update('website', `sessions.${sid}`, session);
      cb(null);
    };
    this.sessionStore.destroy = async (sid, cb) => this.db.delete('website', `sessions.${sid}`).then(() => cb());
  }

  #setupApp() {
    this.app = express()
      .disable('x-powered-by')
      .set('json spaces', 2)
      .set('title', client.user.username)
      .use(
        compression(),
        rateLimit({
          windowMs: 60000, //1min
          max: 100,
          message: '<body style="background-color:#111;color:#ff0000"><p style="text-align:center;top:50%;position:relative;font-size:40;">Sorry, you have been ratelimited!</p></body>'
        }),
        bodyParser.json({ limit: '100kb' }),
        bodyParser.urlencoded({ extended: true, limit: '100kb' }), //todo: error handling?
        xss(),
        session({
          name: 'sessionId',
          secret: this.keys.token,
          resave: false,
          saveUninitialized: false,
          store,
          cookie: {
            secure: domain.startsWith('https'),
            httpOnly: domain.startsWith('https')
          }
        }),
        passport.initialize(),
        passport.session()
      )
      .use('/api/:v/internal', cors({ origin: domain }))
      .use(
        this.router,
        Dashboard.getApp(),
        (err, req, res, next) => {
          error(err, req, res);
          if (res.headersSent) try { return next(err); } catch { }
          //send html only to browser
          if (req.headers?.['user-agent']?.includes('Mozilla')) return res.status(500).sendFile(path.join(process.cwd(), './CustomSites/error/500.html'));
          res.sendStatus(500);
        },
        (req, res) => {
          if (req.headers?.['user-agent']?.includes('Mozilla')) return res.status(404).sendFile(path.join(process.cwd(), './CustomSites/error/404.html'));
          res.sendStatus(404);
        }
      );
  }

  #setupRouter() {
    this.router = express.Router().all('*', async (req, res, next) => {
      try {
        if (req.path === '/') return res.redirect('/home');
        if (req.path.startsWith('/api/') && !/^\/api\/v\d+\//i.test(req.path.endsWith('/') ? req.path : req.path + '/')) res.redirect(req.path.replace('/api/', '/api/v1/'));
        if (req.path == '/dashboard') return res.redirect(301, '/manage');

        const
          pathStr = path.join(process.cwd(), '/CustomSites', path.normalize(req.path.endsWith('/') ? req.path.slice(0, -1) : req.path).replace(/^(\.\.(\/|\\|$))+/, '')),
          dir = pathStr.substring(0, pathStr.lastIndexOf(path.sep)),
          subDirs = await readdir(dir, { withFileTypes: true }).catch(() => { });

        let data;

        if (subDirs) {
          const filename = subDirs.find(e => {
            const file = pathStr.slice(pathStr.lastIndexOf(path.sep) + 1);
            return + file.includes('.') ? e.name.startsWith(file) : e.name.startsWith(`${file}.`);
          })?.name;

          if (!filename || !subDirs.find(e => e.isFile() && e.name == filename)) {
            if (!subDirs.find(e => e.isDirectory() && e.name == path.basename(req.path))) return next();

            const html = await (await readdir(pathStr, { withFileTypes: true })).reduce(async (acc, file) => {
              const name = escapeHTML(file.isFile() ? file.name.split('.').slice(0, -1).join('.') : file.name);
              return (await acc) + `<a href='./${escapeHTML(path.basename(req.path)) + '/' + name}'>` + escapeHTML((await require(path.join(pathStr, file.name)))?.title || name[0].toUpperCase() + name.slice(1).replace(/[_-]/g, ' ')) + '</a>';
            }, Promise.resolve('<style>body{background-color:#000}div{align-items:stretch;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:2%}a{background-color:#242724;border:none;border-radius:5px;color:#fff;cursor:pointer;display:inline-block;font-family:arial;font-size:16px;min-width:100px;padding:15px 32px;text-align:center;text-decoration:none;transition:background-color .3s ease-in-out}a:hover{background-color:#676867}@media (max-width: 480px){a{flex-basis:calc(100% / 2 - 5px)}}@media (min-width: 481px) and (max-width: 768px){a{flex-basis:calc(100% / 3 - 5px)}}@media (min-width: 769px) and (max-width: 1024px){a{flex-basis:calc(100% / 4 - 5px)}}@media (min-width: 1025px){a{flex-basis:calc(100% / 5 - 5px)}}</style><div>')) + '</div>';

            return res.send(html);
          }

          if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
          data = await require(path.join(dir, filename));
        }

        if (!data) return next();
        if (data.method && (Array.isArray(data.method) && data.method.includes(req.method) || data.method !== req.method)) return res.setHeader('Allow', data.method.join?.(',') ?? data.method).sendStatus(405);
        if (data.permissionCheck && !data.permissionCheck.call(req)) return res.redirect(403, '/error/403');
        if (data.title) res.set('title', data.title);
        if (data.static) {
          const code = String(data.run);
          return res.send(code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')));
        }
        if (typeof data.run == 'function') return data.run.call(this.client, res, req, next);
        return res.send(JSON.stringify(data.run ?? data));
      }
      catch (err) { next(err); }
    });
  }

  async init() {
    while (this.client.ws.status != Status.Ready) await new Promise(r => setTimeout(r, 10));
    await this.client.application.fetch();

    this.dashboard = await createDashboard(this.client, this.keys.dbdLicense, this.keys.secret, this.config.port, this.config.domain, this.config.support);
    this.voteSystem = await new VoteSystem(this.db, this.config.domain, this.keys.webhookURL).init();

    this.app.listen(this.config.port, () => console.log(`Website is online on ${this.config.domain}.`));

    this.initiated = true;
    return this;
  }

  /**@param {Error}err @param {Req}req @param {Res}res*/
  error(err, req, res) {
    (log.error ?? console.error)(err);
    appendFile('./errorlog.log', `[${new Date().toLocaleTimeString('en', { timeStyle: 'medium', hour12: false }).replace(/^24:/, '00:')}] Err: ${JSON.stringify(err)}\nREQ: ${JSON.stringify(inspect(req))}}\nRES: ${JSON.stringify(inspect(res))}`);

    return this;
  }
}