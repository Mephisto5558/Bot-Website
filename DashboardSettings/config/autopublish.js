import DDB from 'discord-dashboard';

export default {
  id: 'autopublish',
  name: 'Auto Publish',
  description: 'Automatically publish/crosspost every message a user writes in an announcement channel',
  type: DDB.formTypes.switch(),
  position: 4
}