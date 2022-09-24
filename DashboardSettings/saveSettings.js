const updated = {};
//Dynamically save, mapped by index and setting id
//!! TEST IF list update updates updated
export default function saveSettings(index, setting, newData) {
  const list = updated[this.id];
  list[index] ? list[index].push([setting, newData]) : list[index] = [[setting, newData]];
  if (list[index].length < this.client.dashboardOptionCount[index]) return;

  let data = this.client.db.get('guildSettings');

  for (let [key, value] of list[index]) {
    const indexes = [...(key.matchAll(/[A-Z]/g))];

    for (const i of indexes) key[i.index] = `":{"${i[0].toLowerCase()}`;

    if (value.embed && !value.embed.description) entry.embed.description = ' ';

    const json = `{"${index}":{"${key}":${JSON.stringify(value)}`;

    data = data.fMerge({ [this.id]: JSON.parse(json.padEnd(json.length + indexes.length + 2, '}')) });
  }

  this.client.db.set('guildSettings', data);
  updated[index].length = 0;
}