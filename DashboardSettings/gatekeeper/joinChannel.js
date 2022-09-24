import DDB from 'discord-dashboard';
import { ChannelType } from 'discord.js';

export default {
  id: 'joinChannel',
  name: 'Welcome Channel',
  description: 'Select the channel to send the welcome message to',
  type: DDB.formTypes.channelsSelect(false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
  position: 1
}