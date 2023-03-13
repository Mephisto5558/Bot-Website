console.log('Starting...');
console.time('Initializing time');

// import SoftUITheme from 'dbd-soft-ui'; //Currently disabled because it requires quick.db wich doesn't run on Node 19
// import DBD from 'discord-dashboard';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
// import fetch from 'node-fetch';
import path from 'path';
// import favicon from 'serve-favicon';
import DB from './db.js';
import bodyParser from 'body-parser';
import { xss } from 'express-xss-sanitizer';
import escapeHTML from 'escape-html';
// import Settings from './settings.js';

function error(err, req, res) {
  console.error(err);
  writeFileSync('./errorLog.log', `[${new Date()}]\nErr: ${err}\nRrq: ${req}\nRes: ${res}`);
}

// async function getCommands() {
//   if (process.env.BotCommandListURL) {
//     try {
//       const data = await fetch(process.env.BotCommandListURL).then(e => e.json());
//       return Array.isArray(data) ? data : [];
//     }
//     catch (err) {
//       if (err.constructor.name == 'FetchError') console.error(`FetchError: Couldn't connect to process.env.BotCommandListURL: ${err.code}`);
//       else throw err;
//     }
//   }
//   else console.warn('process.env.BotCommandListURL is not defined. Not setting commands in the dashboard page.');
//   return [];
// }

/**@param {string}filepath full path*/
async function importFile(filepath) {
  if (!filepath.includes('.')) return existsSync(path.join(filepath, 'index.js')) ? importFile(path.join(filepath, 'index.js')) : void 0;
  switch (filepath.split('.').pop()) {
    case 'js': return (await import(`file://${filepath}`)).default;
    case 'json': return JSON.parse(readFileSync(filepath, 'utf-8'));
    default: return readFileSync(`${filepath}`, 'utf-8');
  }
}

Object.prototype.fMerge = function fMerge(obj, mode, { ...output } = { ...this }) {
  if (`${{}}` != this || `${{}}` != obj) return output;
  for (const key of Object.keys({ ...this, ...obj })) {
    if (`${{}}` == this[key]) output[key] = key in obj ? this[key].fMerge(obj[key], mode) : this[key];
    else if (Array.isArray(this[key])) {
      if (key in obj) {
        if (mode == 'overwrite') output[key] = obj[key];
        else if (mode == 'push') for (const e of obj[key]) output[key].push(e);
        else for (let i = 0; i < this[key].length || i < obj[key].length; i++) output[key][i] = i in obj[key] ? obj[key][i] : this[key][i];
      }
      else output[key] = this[key];
    }
    else output = { ...output, [key]: key in obj ? obj[key] : this[key] };
  }
  return output;
};

const
  router = express.Router(),
  { Support, Website, Keys } = Object.entries(process.env).filter(([k]) => /^(Support|Website|Keys)\./.test(k)).reduce((acc, [k, v]) => {
    k = k.split('.');
    acc[k[0]] = Object.assign({}, acc[k[0]], { [k[1]]: v });
    return acc;
  }, {}),
  client = new Client({ intents: [GatewayIntentBits.Guilds] })
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

// await DBD.useLicense(Keys.dbdLicense);
client.login(Keys.token);

client.db = new DB(Keys.dbConnectionStr);
// client.dashboardOptionCount = [];
while (client.ws.status) await new Promise(r => setTimeout(r, 10));
await client.application.fetch();

// global.embedBuilder = DBD.formTypes.embedBuilder({
//   username: client.user.username,
//   avatarURL: client.user.displayAvatarURL({ forceStatic: true }),
//   defaultJson: {}
// });

// const Dashboard = new (DBD.UpdatedClass())({
//   port, domain,
//   acceptPrivacyPolicy: true,
//   minimizedConsoleLogs: true,
//   noCreateServer: true,
//   useUnderMaintenance: false,
//   useCategorySet: true,
//   html404: readFileSync('./CustomSites/error/404.html', 'utf-8'),
//   redirectUri: `${domain}/discord/callback`,
//   bot: client,
//   seesionStore: 'connect-mongodb-session',
//   ownerIDs: [client.application.owner.id],
//   client: {
//     id: client.user.id,
//     secret: Keys.secret
//   },
//   invite: {
//     scopes: ['bot', 'applications.commands'],
//     permissions: '412317240384'
//   },
//   theme: SoftUITheme({
//     information: {
//       createdBy: client.application.owner.tag,
//       iconURL: client.user.displayAvatarURL(),
//       websiteTitle: `${client.user.username} | Dashboard`,
//       websiteName: `${client.user.username} | Dashboard`,
//       websiteUrl: domain,
//       dashboardUrl: domain,
//       supporteMail: Support.Mail,
//       supportServer: Support.Discord,
//       imageFavicon: client.user.displayAvatarURL(),
//       pageBackGround: 'linear-gradient(#2CA8FF, #155b8d)',
//       preloader: 'Loading...',
//       loggedIn: 'Successfully signed in.',
//       mainColor: '#2CA8FF',
//       subColor: '#ebdbdb'
//     },
//     index: {
//       card: {
//         category: `${client.user.username} Dashboard - The center of everything`,
//         title: 'Welcome to the Teufelsbot dashboard where you can control the features and settings of the bot.',
//         description: 'Look up commands and configurate servers on the left side bar!',
//         image: 'https://i.imgur.com/axnP93g.png'
//       },
//       information: {},
//       feeds: {},
//     },
//     commands: await getCommands()
//   }),
//   underMaintenance: {
//     title: 'Under Maintenance',
//     contentTitle: '<p id="content-title" style="color: #ddd9d9">This page is under maintenance</p>',
//     texts: [
//       '<br><p class="text" style="color: #ddd9d9">' +
//       'We still want to change for the better for you.<br>' +
//       'Therefore, we are introducing technical updates so that we can allow you to enjoy the quality of our services.' +
//       '<br></p><br>'
//     ],
//     bodyBackgroundColors: ['#999', '#0f173d'],
//     buildingsColor: '#6a6a6a',
//     craneDivBorderColor: '#6a6a6a',
//     craneArmColor: '#8b8b8b',
//     craneWeightColor: '#8b8b8b',
//     outerCraneColor: '#6a6a6a',
//     craneLineColor: '#6a6a6a',
//     craneCabinColor: '#8b8b8b',
//     craneStandColors: ['#6a6a6a', undefined, '#f29b8b']
//   },
//   settings: await Settings.call(client)
// });

// await Dashboard.init();

express()
  .disable('x-powered-by')
  .set('json spaces', 2)
  .set('title', client.user.username)
  .use(
    rateLimit({
      windowMs: 60000, //1min
      max: 100,
      message: '<body style="background-color:#111;color:#ff0000"><p style="text-align:center;top:50%;position:relative;font-size:40;">Sorry, you have been ratelimited!</p></body>'
    }),
    // favicon((await fetch(client.user.displayAvatarURL())).body.read()),
    bodyParser.json({ limit: '1kb' }),
    bodyParser.urlencoded({ extended: true, limit: '1kb' }),
    xss(),
    router,
    // Dashboard.getApp(),
    (err, req, res, next) => {
      error(err, req, res);
      if (res.headersSent) try { return next(err); } catch { }
      res.status(500).sendFile(path.join(process.cwd(), './CustomSites/error/500.html'));
    },
    (_, res) => {
      try { res.status(404).sendFile(path.join(process.cwd(), './CustomSites/error/404.html')); } catch { }
    }
  )
  .listen(port, () => console.log(`Website is online on ${domain}.`));

router.all('*', async (req, res, next) => {
  try {
    if (req.path == '/') return res.redirect('/home');
    // if (['/', '/dashboard'].includes(req.path)) return res.redirect(301, '/manage');

    const pathStr = path.join(process.cwd(), '/CustomSites', path.normalize(req.path.endsWith('/') ? req.path.slice(0, -1) : req.path).replace(/^(\.\.(\/|\\|$))+/, ''));
    const dir = pathStr.substring(0, pathStr.lastIndexOf(path.sep));
    let data;

    if (existsSync(dir)) {
      const subDirs = readdirSync(dir, { withFileTypes: true });
      const filename = subDirs.find(e => e.name.startsWith(pathStr.slice(pathStr.lastIndexOf(path.sep) + 1) + '.'))?.name;

      if (!filename || !subDirs.find(e => e.isFile() && e.name == filename)) {
        return !subDirs.find(e => e.isDirectory && e.name == path.basename(req.path)) ? next() : res.send(await readdirSync(pathStr, { withFileTypes: true }).reduce(async (acc, file) => {
          const name = escapeHTML(file.isFile() ? file.name.split('.').slice(0, -1).join('.') : file.name);
          return `${await acc}<button class="button" onclick="window.location.href=\`\${window.location.pathname}/${name}\`;">${(await importFile(path.join(pathStr, file.name)))?.title || name[0].toUpperCase() + name.slice(1).replace(/[_-]/g, ' ')}</button>`;
        }, '<style>.button-container{align-items:strech;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:2%}.button{background-color:#242724;border:none;border-radius:5px;color:#fff;cursor:pointer;display:inline-block;font-size:16px;min-width:100px;padding:15px 32px;text-align:center;text-decoration:none;transition:background-color .3s ease-in-out}.button:hover{background-color:#676867}@media (max-width: 480px){.button{flex-basis:calc(100% / 2 - 5px)}}@media (min-width: 481px) and (max-width: 768px){.button{flex-basis:calc(100% / 3 - 5px)}}@media (min-width: 769px) and (max-width: 1024px){.button{flex-basis:calc(100% / 4 - 5px)}}@media (min-width: 1025px){.button{flex-basis:calc(100% / 5 - 5px)}}</style><div class="button-container">') + '</div>');
      }

      if (filename.endsWith('.html')) return res.sendFile(path.join(dir, filename));
      data = await importFile(path.join(dir, filename));
    }

    if (!data) return next();
    if (data.permissionCheck && !data.permissionCheck.call(req)) return res.redirect(403, '/error/403');
    if (data.title) res.set('title', data.title);
    if (typeof data.run == 'function') return data.run.call(client, res, req, next);
    return res.send(JSON.stringify(data.run ?? data));
  } catch (err) { next(err); }
});

process
  .on('unhandledRejection', error)
  .on('uncaughtExceptionMonitor', error)
  .on('uncaughtException', error);

console.timeEnd('Starting time');