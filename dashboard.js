
import { readFile } from 'fs/promises';
import fetch from 'node-fetch';
import DBD from 'discord-dashboard';
// import SoftUITheme from 'dbd-soft-ui'; //Currently disabled because it requires quick.db wich doesn't run on Node 19
import Settings from './settings.js';

const { devIds } = JSON.parse(await readFile('./config.json', 'utf-8').catch(() => '{}')) || {};

async function getCommands() {
  if (process.env.BotCommandListURL) {
    try {
      const data = await fetch(process.env.BotCommandListURL).then(e => e.json());
      return Array.isArray(data) ? data : [];
    }
    catch (err) {
      if (err.constructor.name == 'FetchError') console.error(`FetchError: Couldn't connect to process.env.BotCommandListURL: ${err.code}`);
      else throw err;
    }
  }
  else console.warn('process.env.BotCommandListURL is not defined. Not setting commands in the dashboard page.');
  return [];
}

/**@param {import('discord.js').Client}client @returns {Promise<Dashboard>}dashboard*/
export default async function createDashboard(client, dbdLicense, secret, port, domain, Support) {
  return console.error('You tried to run createDashboard but it is currently not supported.');

  client.dashboardOptionCount = [];
  global.embedBuilder = DBD.formTypes.embedBuilder({
    username: client.user.username,
    avatarURL: client.user.displayAvatarURL({ forceStatic: true }),
    defaultJson: {}
  });

  await DBD.useLicense(dbdLicense);
  const Dashboard = new (DBD.UpdatedClass())({
    port, domain,
    acceptPrivacyPolicy: true,
    minimizedConsoleLogs: true,
    noCreateServer: true,
    useUnderMaintenance: false,
    useCategorySet: true,
    html404: await readFile('./CustomSites/error/404.html', 'utf-8'),
    redirectUri: `${domain}/discord/callback`,
    bot: client,
    seesionStore: 'connect-mongodb-session',
    ownerIDs: devIds,
    client: {
      id: client.user.id,
      secret
    },
    invite: {
      scopes: ['bot', 'applications.commands'],
      permissions: '412317240384'
    },
    theme: SoftUITheme({
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
      commands: await getCommands()
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
      craneStandColors: ['#6a6a6a', undefined, '#f29b8b']
    },
    settings: await Settings.call(client)
  });

  await Dashboard.init();
  return Dashboard;
}