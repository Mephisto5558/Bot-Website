# Bot-Website

[![Activity](https://img.shields.io/github/commit-activity/m/Mephisto5558/Bot-Website)](https://github.com/Mephisto5558/Bot-Website/pulse)
[![License](https://img.shields.io/github/license/Mephisto5558/Bot-Website)](https://github.com/Mephisto5558/Bot-Website/blob/main/LICENSE)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![wakatime](https://wakatime.com/badge/github/Mephisto5558/Bot-Website.svg)](https://wakatime.com/badge/github/Mephisto5558/Bot-Website)<br>
[![npm version](https://badge.fury.io/js/@mephisto5558%2Fbot-website.svg)](https://www.npmjs.com/package/@mephisto5558/bot-website)
[![npm downloads](https://img.shields.io/npm/dm/%40mephisto5558%2Fbot-website)](https://www.npmjs.com/package/@mephisto5558/bot-website)<br>
[![CodeQL](https://github.com/Mephisto5558/Bot-Website/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Mephisto5558/Bot-Website/actions/workflows/codeql.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)<br>
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)<br>
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Bot-Website&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Bot-Website)

A website & dashboard for my discord bot with an easy way of adding new dashboard settings & pages.

### Note that this library currently uses a deprecated (but working) library for its dashboard.

## Requirements
- Node.js 16.9.0 or newer
- A [free license key from Assistants Center](https://assistantscenter.com/discord-dashboard/v2)

## Installation
To install the library, run the following command:

```bash
npm install @mephisto5558/bot-website
```

## Usage
### Import the module
First, you need to import the `WebServer` module into your JavaScript file:

```js
const { WebServer } = require('@mephisto5558/bot-website');
// or
import { WebServer } from '@mephisto5558/bot-website'
```

After installing and importing the library, you can initialize the web server with the following code snippet:

```js
const client = /* Your discord.js client instance */;
const db = /* Your database (@mephisto5558/mongoose-db) instance */;
const keys = {
 secret: /* Your Discord application secret */,
 dbdLicense: /* Your discord-dashboard license */,
 webhookURL: /* Your webhook URL for the voting system. This is optional. */
};

const webServer = new WebServer(client, db, keys);
await webServer.init();
console.log('Website is online.');
```

## Configuration
The `WebServer` class accepts a configuration object that allows you to customize various aspects of the web server, including:

- `support`: An object containing contact information for support.
- `port`: The port on which the web server will listen.
- `domain`: The domain name or IP address of the web server.
- `errorPagesDir`: The directory containing custom error pages.
- `settingsPath`: The path to the directory containing the settings for the dashboard. More info [here](#settings-parameter)
- `customPagesPath`: The path to the directory containing custom pages for the website. More info [here](#custom-pages)

Here's an example of how to configure the web server:

```js
const webServer = new WebServer(client, db, keys, {
 support: {
    mail: 'support@example.com',
    discord: 'https://discord.gg/yourserver'
 },
 port: 8000,
 domain: 'https://example.com',
 errorPagesDir: './error-pages',
 settingsPath: './settings',
 customPagesPath: './custom-pages'
});
```

## Settings parameter
For your convenience, you don't need to provide the settings as an object, instead you just need to create the correct files and provide the path to your settings when initializing the class.

### The settings follow the following structure:
- category 1
  - _index.json
  - setting_1.js
  - setting_2.js
- category 2
  - ...

The `_index.json` has the following properties:
- `id`: category id, settings are saved to the db under this id
- `name`: the categorie's display name
- `description`: the description for users
- `position`: display position on the website, starting at 0
___

The `settings.js` have the following properties [exported](https://nodejs.org/api/modules.html#moduleexports):
- `id`: setting id, saved to the db under that id
- `name`: display name
- `description`: description for users
- `type`:
    - the [form type's](https://docs.assistantscenter.com/discord-dashboard/v2/methods/create-form-type) name
    - the form type itself
    - a function returning the form type (can be a promise)
- `position`: display position on the website, starting at 0

## Custom pages
Custom pages have nothing todo with the dashboard and are handled separately.

For your convenience, you don't need to provide the pages as an object, instead you just need to create the correct files and provide the path to your custom pages when initializing the class.

Every folder in the custom pages folder is a part of the URL.
For example, if you have file path `project/customSites/api/v1/user.js` with `customSites` set as the custom sites directory, the URL would look like this: `https://example.com/api/v1/user`

The pages can either be html files or anything that can be loaded by [node.js require()](https://nodejs.org/api/modules.html#requireid).
___
If the file is empty, it will be ignored.
If it is a json or javascript file, it can have the following properties:

- `method`: The allowed request method, (`GET`, `POST`, etc.) can be a string or an array or strings. Defaults to `GET`.
- `permissionCheck` (JS files only): a function that should return false if the user should not access the page.
- `title`: The page title, shown in the browser tab
- `static`: A boolean if the data is static.
- `run`: Any kind of data. gets called with the WebServer as this, response and request and the express.js next function. If it's not a function, gets turned into json. If `run` does not exist, will instead send the **full file** as json.

# Other infos
### Sessions
Currently, only one session per user is allowed, meaning if the user logs in from another browser/device, the old session will be deleted.

### Favicon
A [favicon](https://en.wikipedia.org/wiki/Favicon) can be set by creating a custom page called `favicon.ico.js` that redirects to an image url.

For example, if you want your discord client's avatar as favicon:
```js
// favicon.ico.js
module.exports = {
  run: function (res) { return res.redirect(this.client.user.displayAvatarURL()); }
};
```


## If you have any other questions or suggestions, please create an [issue](https://github.com/Mephisto5558/Bot-Website/issues/new).
