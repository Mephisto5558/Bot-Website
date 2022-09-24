import DDB from 'discord-dashboard';
import { readdirSync, readFileSync } from 'fs';
import saveSettings from './DashboardSettings/saveSettings.js';

/** @returns {object[]} List of settings */
export default async function getSettings() {
  const categoryOptionList = [];
  const guildSettings = this.db.get('guildSettings');

  for (const subFolder of readdirSync('./DashboardSettings', { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const index = JSON.parse(readFileSync(`./DashboardSettings/${subFolder}/_index.json`, 'utf-8'));
    const optionList = [{
      title: 'Important!',
      description: 'You need to press the submit button on the bottom of the page to save settings!',
      optionType: 'spacer',
      position: -1,
    }];

    this.dashboardOptionCount[index.id] = 0;

    if (index.id != 'config') {
      optionList.push({
        optionId: `${index.id}.enable`,
        optionName: 'Enable Module',
        optionDescription: 'Enable this Module',
        position: 0,
        optionType: DDB.formTypes.switch(),

        getActualSet: async ({ guild }) => guildSettings[guild.id]?.[index.id]?.enable,
        setNew: async ({ guild, newData }) => saveSettings.call(guild.object, index.id, 'enable', newData),
      });

      this.dashboardOptionCount[index.id]++
    }

    for await (
      const { default: setting } of readdirSync(`./DashboardSettings/${subFolder}`).filter(e => e.endsWith('.js')).map(async e => import(`./DashboardSettings/${subFolder}/${e}`))
    ) {
      if (setting.type == 'spacer') {
        optionList.push({
          title: setting.name,
          description: setting.description,
          optionType: setting.type,
          position: setting.position
        });
        continue;
      }

      optionList.push({
        optionId: `${index.id}.${setting.id}`,
        optionName: setting.name,
        optionDescription: setting.description,
        optionType: typeof setting.type == 'function' ? await setting.type.call(this) : setting.type,
        position: setting.position,
        getActualSet: setting.get || (async ({ guild }) => {
          let gSetting = guildSettings[guild.id]?.[index.id] || guildSettings.default?.[index.id];
          const items = setting.id.replace(/([A-Z])/g, r => `.${r.toLowerCase()}`).split('.');

          for (const entry of items) gSetting = gSetting?.[entry];
          if (!gSetting) {
            gSetting = guildSettings.default?.[index.id];
            for (const entry of items) gSetting = gSetting?.[entry];
          }

          return gSetting;
        }),
        setNew: setting.set || (async ({ guild, newData }) => saveSettings.call(guild.object, index.id, setting.id, newData)),
        allowedCheck: setting.auth
      });

      this.dashboardOptionCount[index.id]++
    }

    categoryOptionList.push({
      categoryId: index.id,
      categoryName: index.name,
      categoryDescription: index.description,
      position: index.position,
      categoryOptionsList: optionList.sort((a, b) => a.position - b.position)
    })
  }

  return categoryOptionList.sort((a, b) => a.position - b.position);
}