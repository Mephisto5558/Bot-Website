import { readFile } from 'fs/promises';
const { devIds } = JSON.parse(await readFile('./config.json', 'utf-8').catch(() => '{}')) || {};

export default {
  run: async (res, req) => req.user ? res.json({ ...req.user, dev: devIds?.includes(req.user?.id) }) : res.json({ error: 401 })
};