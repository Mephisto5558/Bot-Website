const updated = {};
//Dynamically save, mapped by index and setting id

function replaceAt(index, replacement) {
  return this.substring(0, index) + replacement + this.substring(index + 1);
}

export default async function saveSettings(index, setting, newData) {
  updated[this.id] = (updated[this.id] || {}).fMerge({ [index]: { [setting]: newData } });
  if (Object.keys(updated[this.id][index]).length < this.client.dashboardOptionCount[index]) return;

  let data = await this.client.db.get('guildSettings');

  for (let [key, value] of Object.entries(updated[this.id][index])) {
    const indexes = [...(key.matchAll(/[A-Z]/g))];
    let json = key;

    for (const i of indexes) json = replaceAt.call(json, i.index, `":{"${i[0].toLowerCase()}`);

    if (value.embed && !value.embed.description) value.embed.description = ' ';

    json = `{"${index}":{"${json}":${JSON.stringify(value)}`;
    data = data.fMerge({ [this.id]: JSON.parse(json.padEnd(json.length + indexes.length + 2, '}')) });
  }

  this.client.db.set('guildSettings', data);
  delete updated[index];
}