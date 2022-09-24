console.log('Starting...');
console.time('Initializing time');

process
  .on('unhandledRejection', console.error)
  .on('uncaughtExceptionMonitor', console.error)
  .on('uncaughtException', console.error);

import { Client, GatewayIntentBits } from 'discord.js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import DBD from 'discord-dashboard';
import DarkDashboard from 'dbd-dark-dashboard';
import fetch from 'node-fetch';
import path from 'path';
import express from 'express';
import favicon from 'serve-favicon';
import rateLimit from 'express-rate-limit';

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
  .on('error', console.error)

let domain = Website.Domain || (process.env.SERVER_IP ?? 'http://localhost') + ':' + (process.env.PORT ?? process.env.SERVER_PORT ?? 8000);

console.timeEnd('Initializing time');
console.time('Starting time');

if (!/^https?:\/\//.test(domain)) {
  if (Website.Domain) throw new Error('The Website.Domain specified in config.json is invalid! It needs to start with "http" or "https"!');
  domain = 'http://' + domain;
}

await DBD.useLicense(Keys.dbdLicense);
client.login(Keys.token);

while (client.ws.status) await new Promise(r => setTimeout(r, 10));
await client.application.fetch();

global.embedBuilder = DBD.formTypes.embedBuilder({
  username: client.user.username,
  avatarURL: client.user.displayAvatarURL({ forceStatic: true }),
  defaultJson: {}
});

const data = { commands: [], settings: [] } //await fetch(`${Keys.BotIp}/api/list?key=${Keys.APIKey}`).then(r => r.json());

const Dashboard = new (DBD.UpdatedClass())({
  acceptPrivacyPolicy: true,
  minimizedConsoleLogs: true,
  noCreateServer: true,
  html404: readFileSync('./ErrorPages/404.html', 'utf-8'),
  useUnderMaintenance: false,
  port: (process.env.PORT ?? process.env.SERVER_PORT ?? 8000),
  domain,
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
  rateLimits: {
    manage: rateLimit,
    guildPage: rateLimit,
    settingsUpdatePostAPI: rateLimit,
    discordOAuth2: rateLimit
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
    commands: data.commands
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
  settings: data.settings
});

await Dashboard.init();

express()
  .use(rateLimit({
    windowMs: 1 * 60 * 1000, // 1min
    max: 30,
    message: '<body style="background-color:#000 color: #ff0000"><p>Sorry, you have been ratelimited!</p></body>'
  }))
  .use(favicon(await fetch(client.user.displayAvatarURL()).then(e => e.body.read())))
  .use(express.json())
  .set('json spaces', 2)
  .use(router)
  .use(Dashboard.getApp())
  .use((err, req, res, _) => {
    console.error('\x1b[1;31m%s\x1b[0m', ' [Error Handling] :: Unhandled Website Error/Catch');
    console.error(err.stack);
    console.error(req, res);
    res.status(500).sendFile(`${process.cwd()}/ErrorPages/50x.html`);
  })
  .listen(process.env.PORT ?? process.env.SERVER_PORT ?? 8000, _ => console.log(`Website is online`));

router.all('*', async (req, res, next) => {
  try {
    if (['/', '/dashboard'].includes(req.path)) return res.redirect(301, '/manage');
    if (req.path.startsWith('/manage')) return next();

    const pathStr = path.join(process.cwd(), '/CustomSites', path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, ''));
    const dir = pathStr.substring(0, pathStr.lastIndexOf(path.sep));
    let data;

    if (existsSync(dir)) {
      const file = readdirSync(dir, { withFileTypes: true }).find(e => e.isFile() && e.name.split('.')[0] == pathStr.substring(pathStr.lastIndexOf(path.sep) + 1))?.name || '';
      switch (file.split('.')[file.split('.').length - 1]) {
        case '': return next();
        case 'js':
        case 'json': data = await import(`file://${dir}/${file}`); break;
        default: data = readFileSync(`${dir}/${file}`, 'utf-8'); break;
      }
    }

    if (!data) return next();
    if (data.permissionCheck && !data.permissionCheck.call(req)) return res.sendFile(`${process.cwd()}/ErrorPages/403.html`);
    if (typeof (data.run ?? data) == 'function') return res.send(await (data.run ?? data).call(client, req, res, next));
    res.send(data.run ?? data);
  }
  catch (err) {
    res.status(500).sendFile(`${process.cwd()}/ErrorPages/50x.html`);
    console.error(err, req, res);
  }
});

console.timeEnd('Starting time');