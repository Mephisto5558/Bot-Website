import DDB from 'discord-dashboard';
import { readdirSync, readFileSync } from 'fs';

function fMerge(obj1, obj2, mode, { ...output } = { ...obj1 }) { //do not put on Object as it breaks discord auth /shrug
  if (`${{}}` != obj1 || `${{}}` != obj2) return output;
  for (const key of Object.keys({ ...obj1, ...obj2 })) {
    if (`${{}}` == obj1[key]) output[key] = key in obj2 ? fMerge(obj1[key], obj2[key], mode) : obj1[key];
    else if (Array.isArray(obj1[key])) {
      if (key in obj2) {
        if (mode == 'overwrite') output[key] = obj2[key];
        else if (mode == 'push') for (const e of obj2[key]) output[key].push(e);
        else for (let i = 0; i < obj1[key].length || i < obj2[key].length; i++) output[key][i] = i in obj2[key] ? obj2[key][i] : obj1[key][i];
      }
      else output[key] = obj1[key];
    }
    else output = { ...output, [key]: key in obj2 ? obj2[key] : obj1[key] };
  }
  return output;
};

/** @returns {object[]} List of settings */
export default async function getSettings() {
  const
    categoryOptionList = [],
    { blacklist } = await this.db.get('botSettings');

  for (const subFolder of readdirSync('./DashboardSettings', { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const index = JSON.parse(readFileSync(`./DashboardSettings/${subFolder}/_index.json`, 'utf-8'));
    const optionList = [{
      optionId: `${index.id}.spacer`,
      title: 'Important!',
      description: 'You need to press the submit button on the bottom of the page to save settings!',
      optionType: 'spacer',
      position: -1,
    }];

    if (!index.disableToggle) optionList.push({
      optionId: `${index.id}.enable`,
      optionName: 'Enable Module',
      optionDescription: 'Enable this Module',
      position: 0,
      optionType: DDB.formTypes.switch()
    });

    for await (const { default: setting } of readdirSync(`./DashboardSettings/${subFolder}`).filter(e => e.endsWith('.js')).map(async e => import(`./DashboardSettings/${subFolder}/${e}`)))
      optionList.push(setting.type == 'spacer' ? {
        optionId: `${index.id}.spacer`,
        title: setting.name,
        description: setting.description,
        optionType: setting.type,
        position: setting.position
      } : {
        optionId: `${index.id}.${setting.id}`,
        optionName: setting.name,
        optionDescription: setting.description,
        optionType: typeof setting.type == 'function' ? await setting.type.call(this) : setting.type,
        position: setting.position,
        allowedCheck: async ({ guild, user }) => {
          if (blacklist?.includes(user.id)) return { allowed: false, errorMessage: 'You have been blacklisted from using the bot.' };
          if (setting.auth === false) return { allowed: false, errorMessage: 'This feature has been disabled.' };
          return setting.auth?.(guild, user) ?? { allowed: true };
        }
      });

    categoryOptionList.push({
      categoryId: index.id,
      categoryName: index.name,
      categoryDescription: index.description,
      position: index.position,
      getActualSet: ({ guild }) => Promise.all(optionList.map(async e => {
        if (e.get) return { optionId: e.optionId, data: e.get(arguments) };
        const items = e.optionId.replace(/([A-Z])/g, r => `.${r.toLowerCase()}`).split('.');
        if (items[items.length - 1] == 'spacer') return { optionId: e.optionId, data: e.description };

        const guildSettings = this.db.get('guildSettings');
        const data = items.reduce((acc, e) => acc?.[e], guildSettings[guild.id]) ?? items.reduce((acc, e) => acc?.[e], guildSettings.default);
        return { optionId: e.optionId, data };
      })),
      setNew: async ({ guild, data: dataArray }) => {
        let guildSettings = this.db.get('guildSettings');

        for (const { optionId, data } of dataArray) {
          if (data.embed && !data.embed.description) data.embed.description = ' ';

          const indexes = [...optionId.replaceAll('.', '":{"').matchAll(/[A-Z]/g)];
          const json = `{"${indexes.reduce((acc, e) => acc.substring(0, e.index) + ':{' + e[0].toLowerCase() + acc.substring(e.index + 1), optionId.replaceAll('.', '":{"'))}":${JSON.stringify(data)}`;

          guildSettings = fMerge(guildSettings, { [guild.id]: JSON.parse(json.padEnd(json.length + json.split('{').length - 1, '}')) });
        }

        return this.db.set('guildSettings', guildSettings);
      },
      categoryOptionsList: optionList.sort((a, b) => a.position - b.position)
    });
  }

  return categoryOptionList.sort((a, b) => a.position - b.position);
}