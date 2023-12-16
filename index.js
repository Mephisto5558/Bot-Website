console.log('Starting...');
console.time('Initializing time');

import { appendFile, access, readdir, readFile } from 'fs/promises';
import { inspect } from 'util';
import express from 'express';
import { Client, GatewayIntentBits, Status } from 'discord.js';
import createDashboard from './dashboard.js';
import { NoCacheDB } from '@mephisto5558/mongoose-db';
import VoteSystem from './Utils/VoteSystem.js';
import passport from 'passport';
import Strategy from 'passport-discord';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import { xss } from 'express-xss-sanitizer';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import escapeHTML from 'escape-html';
import debug from 'debug';

debug.log = console.debug.bind(console);

function error(err, req, res) {
  console.error(err);
  appendFile('./errorlog.log', `[${new Date().toLocaleTimeString('en', { timeStyle: 'medium', hour12: false }).replace(/^24:/, '00:')}] Err: ${JSON.stringify(err)}\nREQ: ${JSON.stringify(inspect(req))}}\nRES: ${JSON.stringify(inspect(res))}`);
}

/**@param {string}filepath full path @returns {Promise}*/
async function importFile(filepath) {
  if (!filepath.includes('.')) return (await access(path.join(filepath, 'index.js')).catch(() => true)) ? void 0 : importFile(path.join(filepath, 'index.js'));
  switch (filepath.split('.').pop()) {
    case 'js': return (await import(`file://${filepath}`)).default;
    case 'json': return JSON.parse(await readFile(filepath, 'utf-8'));
    default: return readFile(`${filepath}`, 'utf-8');
  }
}

const
  router = express.Router(),
  { Support, Website, Keys } = Object.entries(process.env).filter(([k]) => /^(Support|Website|Keys)\./.test(k)).reduce((acc, [k, v]) => {
    k = k.split('.');
    acc[k[0]] = { ...acc[k[0]], [k[1]]: v };
    return acc;
  }, {}),
  client = new Client({ intents: [GatewayIntentBits.Guilds], presence: { status: 'invisible' } })
    .on('debug', debug => debug.toLowerCase().includes('heartbeat') ? void 0 : console.log(debug))
    .on('error', error),
  port = process.env.PORT ?? process.env.SERVER_PORT ?? 80;

let domain = Website.Domain || process.env.SERVER_IP || process.env.IP || `http://localhost:${port}`;

console.timeEnd('Initializing time');
console.time('Starting time');

if (!/^https?:\/\//.test(domain)) {
  if (Website.Domain) throw new Error('The Website.Domain specified in process.env is invalid! It needs to start with "http://" or "https://"!');
  domain = 'http://' + domain;
}

await client.login(Keys.token);

client.db = new NoCacheDB(Keys.dbConnectionStr);
client.voteSystem = await new VoteSystem(client.db, domain, Keys.webhookURL).init();
while (client.ws.status != Status.Ready) await new Promise(r => setTimeout(r, 10));
await client.application.fetch();

const Dashboard = await createDashboard(client, Keys.dbdLicense, Keys.secret, port, domain, Support);

passport.serializeUser((user, done) => done(null, {
  id: user.id, username: user.username,
  locale: user.locale, avatar: user.avatar, banner: user.banner
}));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new Strategy({
  clientID: client.user.id,
  clientSecret: Keys.secret,
  callbackURL: `${domain}/auth/discord/callback`,
  scope: ['identify']
}, async (_accessToken, _refreshToken, user, done) => done(null, user)));

const store = new session.MemoryStore();
store.get = async (sid, cb) => client.db.get('website', `sessions.${sid}`).then(e => cb(null, e));
store.set = async (sid, session, cb) => {
  if (session.passport?.user?.id) await client.db.update('website', 'sessions', Object.fromEntries(Object.entries(await client.db.get('website', 'sessions')).filter(([, e]) => e.passport?.user?.id != session.passport.user.id)));
  await client.db.update('website', `sessions.${sid}`, session);
  cb(null);
};
store.destroy = async (sid, cb) => client.db.delete('website', `sessions.${sid}`).then(() => cb());

express()
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
    bodyParser.urlencoded({ extended: true, limit: '100kb' }),//error handling?
    xss(),
    session({
      name: 'sessionId',
      secret: Keys.token,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: domain.includes('repl.co') ? undefined : {
        secure: domain.startsWith('https'),
        httpOnly: domain.startsWith('https')
      }
    }),
    passport.initialize(),
    passport.session()
  )
  .use('/api/:v/internal', cors({ origin: domain }))
  .use(
    router,
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
  )
  .listen(port, () => console.log(`Website is online on ${domain}.`));

router.all('*', async (req, res, next) => {
  try {
    if (req.path == '/') return res.redirect('/home');
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
          return (await acc) + `<a href='./${escapeHTML(path.basename(req.path)) + '/' + name}'>` + escapeHTML((await importFile(path.join(pathStr, file.name)))?.title || name[0].toUpperCase() + name.slice(1).replace(/[_-]/g, ' ')) + '</a>';
        }, Promise.resolve('<style>body{background-color:#000}div{align-items:stretch;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:2%}a{background-color:#242724;border:none;border-radius:5px;color:#fff;cursor:pointer;display:inline-block;font-family:arial;font-size:16px;min-width:100px;padding:15px 32px;text-align:center;text-decoration:none;transition:background-color .3s ease-in-out}a:hover{background-color:#676867}@media (max-width: 480px){a{flex-basis:calc(100% / 2 - 5px)}}@media (min-width: 481px) and (max-width: 768px){a{flex-basis:calc(100% / 3 - 5px)}}@media (min-width: 769px) and (max-width: 1024px){a{flex-basis:calc(100% / 4 - 5px)}}@media (min-width: 1025px){a{flex-basis:calc(100% / 5 - 5px)}}</style><div>')) + '</div>';

        return res.send(html);
      }

      if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
      data = await importFile(path.join(dir, filename));
    }

    if (!data) return next();
    if (data.method && (Array.isArray(data.method) && data.method.includes(req.method) || data.method !== req.method)) return res.setHeader('Allow', data.method.join?.(',') ?? data.method).sendStatus(405);
    if (data.permissionCheck && !data.permissionCheck.call(req)) return res.redirect(403, '/error/403');
    if (data.title) res.set('title', data.title);
    if (data.static) {
      const code = `${data.run}`;
      return res.send(code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')));
    }
    if (typeof data.run == 'function') return data.run.call(client, res, req, next);
    return res.send(JSON.stringify(data.run ?? data));
  } catch (err) { next(err); }
});

process
  .on('unhandledRejection', error)
  .on('uncaughtExceptionMonitor', error)
  .on('uncaughtException', error);

console.timeEnd('Starting time');