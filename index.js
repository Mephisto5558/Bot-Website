console.log('Starting...');
console.time('Initializing time');

const
  { Client, GatewayIntentBits } = require('discord.js'),
  { Support, Website, Keys } = require('./config.json'),
  DBD = require('discord-dashboard'),
  { readFileSync, readdirSync, existsSync } = require('fs'),
  DarkDashboard = require('dbd-dark-dashboard'),
  fetch = require('node-fetch').default,
  path = require('path'),
  client = new Client({ intents: [GatewayIntentBits.Guilds] }),

  express = require('express'),
  app = express(),
  favicon = require('serve-favicon'),
  router = express.Router(),
  rateLimit = require('express-rate-limit');

console.timeEnd('Initializing time');
console.time('Starting time');

(async function main() {
  await DBD.useLicense(Keys.dbdLicense);
  await this.login(Keys.token);
  let domain = Website.Domain || (process.env.SERVER_IP ?? 'http://localhost') + ':' + (process.env.PORT ?? process.env.SERVER_PORT ?? 8000);

  if (!/^https?:\/\//.test(domain)) {
    if (Website.Domain) throw new Error('The Website.Domain specified in config.json is invalid! It needs to start with "http" or "https"!');
    domain = 'http://' + domain;
  }

  const data = { commands: [], settings: [] } //await fetch(`${Keys.BotIp}/api/list?key=${Keys.APIKey}`).then(r => r.json());

  global.embedBuilder = DBD.formTypes.embedBuilder({
    username: this.user.username,
    avatarURL: this.user.displayAvatarURL({ forceStatic: true }),
    defaultJson: {}
  });

  await this.application.fetch();
  const Dashboard = new (DBD.UpdatedClass())({
    acceptPrivacyPolicy: true,
    minimizedConsoleLogs: true,
    noCreateServer: true,
    html404: readFileSync('./ErrorPages/404.html', 'utf-8'),
    useUnderMaintenance: false,
    port: (process.env.PORT ?? process.env.SERVER_PORT ?? 8000),
    domain,
    redirectUri: `${domain}/discord/callback`,
    bot: this,
    ownerIDs: [this.application.owner.id],
    client: {
      id: this.user.id,
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
        createdBy: this.application.owner.tag,
        iconURL: this.user.displayAvatarURL(),
        websiteTitle: `${this.user.username} | Dashboard`,
        websiteName: `${this.user.username} | Dashboard`,
        websiteUrl: domain,
        dashboardUrl: domain,
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

  app
    .use(rateLimit({
      windowMs: 1 * 60 * 1000, // 1min
      max: 30,
      message: '<body style="background-color:#000 color: #ff0000"><p>Sorry, you have been ratelimited!</p></body>'
    }))
    .use(favicon(await fetch(this.user.displayAvatarURL()).then(e => e.body.read())))
    .use(express.json())
    .set('json spaces', 2)
    .use(router)
    .use(Dashboard.getApp())
    .use((err, req, res, _) => {
      console.error('\x1b[1;31m%s\x1b[0m', ' [Error Handling] :: Unhandled Website Error/Catch');
      console.error(err.stack);
      console.error(req, res);
      res.status(500).sendFile(path.join(__dirname, './ErrorPages/50x.html'));
    })
    .listen(8000, _ => console.log(`Website is online`));
}).call(client);

router.all('*', async (req, res, next) => {
  if (req.path.endsWith('/')) req.path = req.path.slice(0, -1);
  if (['/', '/dashboard'].includes(req.path)) return res.redirect(301, '/manage');
  if (req.path.startsWith('/manage')) return next();

  const pathStr = path.join(process.cwd(), '/CustomSites', path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, ''));
  const dir = pathStr.substring(0, pathStr.lastIndexOf(path.sep));
  let data;

  if (existsSync(dir)) {
    const file = readdirSync(dir, { withFileTypes: true }).find(e => e.isFile() && e.name == pathStr.substring(pathStr.lastIndexOf(path.sep) + 1)) || '';
    switch (file.split('.')[file.split('.').length - 1]) {
      case '': return next();
      case 'js':
      case 'json': data = require(`${dir}/${file}`); break;
      default: data = readFileSync(`${dir}/${file}`, 'utf-8'); break;
    }
  }

  if (!data) return next();
  if (data.permissionCheck && !data.permissionCheck.call(req)) return res.sendFile(path.join(__dirname, './ErrorPages/403.html'));
  if (typeof (data.run ?? data) == 'function') return res.send(await (data.run ?? data).call(this));
  res.send(data.run ?? data);
});

console.timeEnd('Starting time');