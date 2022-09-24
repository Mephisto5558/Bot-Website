import DDB from 'discord-dashboard';
import { ChannelType } from 'discord.js';

export default {
  id: 'leaveChannel',
  name: 'Leave Channel',
  description: 'Select the channel to send the leave message to',
  type: DDB.formTypes.channelsSelect(false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
  position: 3
}