import DDB from 'discord-dashboard';

export default {
  id: 'lang',
  name: 'Language',
  description: 'The language of the bot',
  type: DDB.formTypes.select({ 'English': 'en', 'German': 'de' }),
  position: 1
}