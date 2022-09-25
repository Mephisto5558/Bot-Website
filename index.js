console.log('Starting...');
console.time('Initializing time');

import DarkDashboard from 'dbd-dark-dashboard';
import DBD from 'discord-dashboard';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import favicon from 'serve-favicon';
import DB from './db.js';
import Settings from './settings.js';

function error(err, req, res) {
  console.error(err);
  writeFileSync('./errorLog.log', `[${new Date()}]\nErr: ${err}\nRrq: ${req}\nRes: ${res}`);
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
  client = new Client({ intents: [GatewayIntentBits.Guilds] }),
  { Support, Website, Keys } = Object.entries(process.env).filter(([k]) => /^(Support|Website|Keys)\./.test(k)).reduce((acc, [k, v]) => {
    k = k.split('.');
    acc[k[0]] = Object.assign({}, acc[k[0]], { [k[1]]: v });
    return acc;
  }, {});

client
  .on('debug', debug => debug.toLowerCase().includes('heartbeat') ? void 0 : console.log(debug))
  .on('error', error);

const port = process.env.PORT ?? process.env.SERVER_PORT ?? 8000;
let domain = (Website.Domain || (process.env.SERVER_IP ?? process.env.IP ?? 'http://localhost')) + ':' + port;

console.timeEnd('Initializing time');
console.time('Starting time');

if (!/^https?:\/\//.test(domain)) {
  if (Website.Domain) throw new Error('The Website.Domain specified in process.env is invalid! It needs to start with "http://" or "https://"!');
  domain = 'http://' + domain;
}

await DBD.useLicense(Keys.dbdLicense);
client.login(Keys.token);

client.db = await new DB(Keys.dbConnectionStr).fetchAll();
client.dashboardOptionCount = [];
while (client.ws.status) await new Promise(r => setTimeout(r, 10));
await client.application.fetch();

const avatar = (await fetch(client.user.displayAvatarURL())).body.read();

global.embedBuilder = DBD.formTypes.embedBuilder({
  username: client.user.username,
  avatarURL: client.user.displayAvatarURL({ forceStatic: true }),
  defaultJson: {}
});

const Dashboard = new (DBD.UpdatedClass())({
  acceptPrivacyPolicy: true,
  minimizedConsoleLogs: true,
  noCreateServer: true,
  useUnderMaintenance: false,
  html403: readFileSync('./CustomSites/error/403.html', 'utf-8'),
  html404: readFileSync('./CustomSites/error/404.html', 'utf-8'),
  html500: readFileSync('./CustomSites/error/500.html', 'utf-8'),
  port, domain,
  redirectUri: `${domain}/discord/callback`,
  bot: client,
  ownerIDs: [client.application.owner.id],
  client: {
    id: client.user.id,
    secret: Keys.secret
  },
  invite: {
    scopes: ['bot', 'applications.commands'],
    permissions: '412317240384'
  },
  theme: DarkDashboard({
    information: {
      createdBy: client.application.owner.tag,
      iconURL: client.user.displayAvatarURL(),
      websiteTitle: `${client.user.username} | Dashboard`,
      websiteName: `${client.user.username} | Dashboard`,
      websiteUrl: domain,
      dashboardUrl: domain,
      supporteMail: Support.Mail,
      supportServer: Support.Discord,
      imageFavicon: client.user.displayAvatarURL(),
      pageBackGround: 'linear-gradient(#2CA8FF, #155b8d)',
      preloader: 'Loading...',
      loggedIn: 'Successfully signed in.',
      mainColor: '#2CA8FF',
      subColor: '#ebdbdb'
    },
    index: {
      card: {
        category: `${client.user.username} Dashboard - The center of everything`,
        title: 'Welcome to the Teufelsbot dashboard where you can control the features and settings of the bot.',
        description: 'Look up commands and configurate servers on the left side bar!',
        image: 'https://i.imgur.com/axnP93g.png'
      },
      information: {},
      feeds: {},
    },
    commands: []
  }),
  underMaintenance: {
    title: 'Under Maintenance',
    contentTitle: '<p id="content-title" style="color: #ddd9d9">This page is under maintenance</p>',
    texts: [
      '<br><p class="text" style="color: #ddd9d9">' +
      'We still want to change for the better for you.<br>' +
      'Therefore, we are introducing technical updates so that we can allow you to enjoy the quality of our services.' +
      '<br></p><br>'
    ],
    bodyBackgroundColors: ['#999', '#0f173d'],
    buildingsColor: '#6a6a6a',
    craneDivBorderColor: '#6a6a6a',
    craneArmColor: '#8b8b8b',
    craneWeightColor: '#8b8b8b',
    outerCraneColor: '#6a6a6a',
    craneLineColor: '#6a6a6a',
    craneCabinColor: '#8b8b8b',
    craneStandColors: ['#6a6a6a', , '#f29b8b']
  },
  settings: await Settings.call(client)
});

await Dashboard.init();

express()
  .set('json spaces', 2)
  .set('title', client.user.username)
  .use(rateLimit({
    windowMs: 30000, // 30sec
    max: 30,
    message: '<body style="background-color:#000; color: #ff0000"><p style="text-align: center;top: 50%;position: relative;font-size: 40;">Sorry, you have been ratelimited!</p></body>'
  }))
  .use(favicon(avatar))
  .use(express.json())
  .use(router)
  .use(Dashboard.getApp())
  .use((err, req, res, next) => {
    error(err, req, res);
    if (res.headersSent) try { return next(err); } catch { }
    res.status(500).sendFile('./CustomSites/error/500.html');
  })
  .listen(port, _ => console.log(`Website is online on ${domain}.`));

router.all('*', async (req, res, next) => {
  try {
    if (['/', '/dashboard'].includes(req.path)) return res.redirect(301, '/manage');

    const pathStr = path.join(process.cwd(), '/CustomSites', path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, ''));
    const dir = pathStr.substring(0, pathStr.lastIndexOf(path.sep));
    let data;

    if (existsSync(dir)) {
      const file = readdirSync(dir, { withFileTypes: true }).find(e => e.isFile() && e.name.split('.')[0] == pathStr.substring(pathStr.lastIndexOf(path.sep) + 1))?.name || '';
      const extention = file.split('.')[file.split('.').length - 1];
      if (!file) return next();

      switch (extention) {
        case 'js': data = (await import(`file://${dir}/${file}`)).default; break;
        case 'json': data = JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')); break;
        case 'html': return res.sendFile(`${dir}/${file}`);
        default: data = readFileSync(`${dir}/${file}`, 'utf-8');
      }
    }

    if (!data) return next();
    if (data.permissionCheck && !data.permissionCheck.call(req)) return res.redirect(403, '/error/403');
    if (data.title) res.set('title', data.title);
    if (typeof data.run == 'function') return data.run.call(client, res, req, next);
    res.send(JSON.stringify(data.run ?? data));
  } catch (err) { next(err); }
});

process
  .on('unhandledRejection', error)
  .on('uncaughtExceptionMonitor', error)
  .on('uncaughtException', error);

console.timeEnd('Starting time');