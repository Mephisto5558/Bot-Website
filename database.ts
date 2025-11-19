/* eslint-disable import-x/extensions */
import type { Cookie } from 'express-session';
import type { Profile } from 'passport-discord-auth';
import type { FeatureRequest } from './index.ts';

type Snowflake = `${bigint}`;

/* eslint-disable sonarjs/redundant-type-aliases -- documentation */
export type sessionId = string;
type guildId = Snowflake;
type userId = Snowflake;
/* eslint-enable sonarjs/redundant-type-aliases */

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