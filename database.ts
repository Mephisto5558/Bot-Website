import type { Guild, User } from 'discord.js';
import type { Cookie } from 'express-session';
import type { Profile } from 'passport-discord-auth';
import type { FeatureRequest } from './voteSystem.js';

/* eslint-disable-next-line sonarjs/redundant-type-aliases -- documentation */
export type sessionId = string;

export type Database = {
  website: {
    sessions: Record<sessionId, {
      cookie: Cookie;
      r?: string;
      redirectURL?: string;
      discordAuthStatus?: {
        loading: boolean;
        success: boolean;
        state: {
          error: string | null;
          data: string | null;
        };
      };
      user?: Profile;
      loggedInLastTime?: boolean;
    }>;
    requests: Record<FeatureRequest['id'], FeatureRequest>;
  };

  botSettings?: {
    blacklist?: User['id'][];
    defaultGuild: Database['guildSettings'][Guild['id']];
  };

  guildSettings: Record<Guild['id'], Record<string, unknown>>;

  userSettings: Record<User['id'], {
    lastVoted?: Date;
    featureRequestAutoApprove?: boolean;
    pageViews?: Record<string, {
      count: number;
      lastVisited: Date;
    }>;
  }>;
};