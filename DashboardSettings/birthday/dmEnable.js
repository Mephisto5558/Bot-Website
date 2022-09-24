import DDB from 'discord-dashboard';

export default {
  id: 'dmEnable',
  name: 'Enable dm messages',
  description: 'DM the member on his/her birthday with a custom message',
  type: DDB.formTypes.switch(),
  position: 4
}