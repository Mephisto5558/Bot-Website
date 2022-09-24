import DDB from 'discord-dashboard';
import { ChannelType } from 'discord.js';

export default {
  id: 'chChannel',
  name: 'Channel',
  description: 'The channel to witch the birthday announcement will get send',
  type: DDB.formTypes.channelsSelect(false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
  position: 2
}