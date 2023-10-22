import { readFile } from 'fs/promises';
const { devIds } = JSON.parse(await readFile('./config.json', 'utf-8').catch(() => '{}')) || {};

export default {
  run: async function (res, req) {
    if ((await this.db.get('botSettings', 'blacklist'))?.includes(req.user.id)) return res.json({ errorCode: 403, error: 'You have been blacklisted from using the bot.' });
    return req.user ? res.json({ ...req.user, dev: devIds?.includes(req.user?.id) }) : res.json({ errorCode: 401, error: 'Not logged in' });
  }
};