import type { APIUser } from 'discord.js';
import type { Cookie } from 'express-session';
import type { Profile } from 'passport-discord';
import type { FeatureRequest } from '.';
import type { sessionId } from './webServer';

export type { Database };
export type { sessionId } from './webServer';

type Snowflake = `${bigint}`;

/* eslint-disable sonarjs/redundant-type-aliases -- documentation */
type guildId = Snowflake;
type userId = Snowflake;
/* eslint-enable sonarjs/redundant-type-aliases */

type Database = {
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
      user?: Profile | APIUser;
      loggedInLastTime?: boolean;
    }>;
    requests: Record<FeatureRequest['id'], FeatureRequest>;
  };

  botSettings?: {
    blacklist?: Snowflake[];

    defaultGuild: Record<string, unknown>;
  };

  guildSettings: Record<guildId, Record<string, unknown>>;

  userSettings: Record<userId, {
    lastVoted?: Date;
    featureRequestAutoApprove?: boolean;
    pageViews?: Record<string, {
      count: number;
      lastVisited: Date;
    }>;
  }>;
};