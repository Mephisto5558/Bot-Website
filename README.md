# Teufelsbot-Website
[![Activity](https://img.shields.io/github/commit-activity/m/Mephisto5558/Teufelsbot-Website)](https://github.com/Mephisto5558/Teufelsbot-Website/pulse)
[![License](https://img.shields.io/github/license/Mephisto5558/Teufelsbot-Website)](https://github.com/Mephisto5558/Teufelsbot-Website/blob/main/LICENSE)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![wakatime](https://wakatime.com/badge/user/f9d04252-581b-43cf-8bc2-31351c68d2e6.svg)](https://wakatime.com/@f9d04252-581b-43cf-8bc2-31351c68d2e6)<br>
[![CodeQL](https://github.com/Mephisto5558/Teufelsbot-Website/actions/workflows/codeql-analysis.yml/badge.svg?branch=main)](https://github.com/Mephisto5558/Teufelsbot-Website/actions/workflows/codeql-analysis.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)<br>
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)<br>
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Mephisto5558_Teufelsbot-Website&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=Mephisto5558_Teufelsbot-Website)

A website & ~~dashboard~~ for my discord bot with an easy way for adding new settings & pages.

Dashboard does not work currently.

### Now includes a feature request & voting page!
<br>

## Requirements
```
Node.js 16.9.0 or newer
MongoDB set up
```

## How to set it up
1. run `git clone https://github.com/Mephisto5558/Teufelsbot-Website`
2. run `npm install`
3. put the following data in process.env and replace the descriptions with the correct values:
```
"Support.Mail": "a email adress for support" (optional)
"Support.Discord": "a discord invite link" (optional)
"Website.Domain": "the domain of your website" (optional, defaults to localhost),
"BotCommandListURL": "The URL used to get the list of commands for the commands page" (optional, has to start with http:// or https://)
"BotUpdateDBURL": "The URL used to tell the bot to fetch a specific db" (optional, has to start with http:// or https://)
"Keys.token": "your discord bot token"
"Keys.secret": "your discord bot client secret"
"Keys.dbdLicense": "your discord-dashboard license" (https://assistantscenter.com/discord-dashboard/v2)
"Keys.dbConnectionStr": "your mongoDB connection string"
```

If you want to set the domain dynamicly than you can use `process.env.PORT` (default: 8000) and `process.env.SERVER_IP` (default: localhost). These will only get used if Website.Domain is not provided.

MongoDB has to been set up with a document called `guildSettings` wich must have at least the following content:
```json
{
  "default": {}
}
```
It will have default settings inside. They have the same structure as the guild specific settings.

<details>
  <summary>Example</summary>
  
```json
{
  "key": "guildSettings",
  "value": {
    "default": {
      "config": {
        "prefix": ".",
        "lang": "en"
      },
      "birthday": {
        "ch": {
          "msg": {
            "embed": {
              "title": "Happy birthday <user.nickname>",
              "description": "We hope you have a wonderful birthday.",
              "color": 39129
            }
          }
        },
        "dm": {
          "msg": {
            "embed": {
              "title": "Happy birthday!",
              "description": "Happy birthday to you! 🎉",
              "color": 39129
            }
          }
        }
      },
      "giveaway": {
        "reaction": "🎉",
        "embedColor": 3800852,
        "embedColorEnd": 16711680
      }
    }
  },
  "__v": 0
}
```
</details>
