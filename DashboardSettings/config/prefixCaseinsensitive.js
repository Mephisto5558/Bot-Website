import DDB from 'discord-dashboard';

export default {
  id: 'prefixCaseinsensitive',
  name: 'Case insensitive',
  description: 'Make the prefix work for uppercase and lowercase letters',
  type: DDB.formTypes.switch(),
  position: 3
}