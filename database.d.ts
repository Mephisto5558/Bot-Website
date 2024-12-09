import type { APIUser, GuildFeature } from 'discord.js';
import type { Cookie } from 'express-session';
import type { FeatureRequest } from '.';

export type { Database };

type Snowflake = `${bigint}`;

/* eslint-disable sonarjs/redundant-type-aliases -- documentation */
type sessionId = string;
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
      user?: APIUser & {
        avatar_decoration_data: {
          asset: string;
          sku_id: string;
        } | null;
        banner_color: `#${number}` | null;
        tag: `${string}#${number}`;
        avatarURL: string | null;
        guilds: {
          id: Snowflake;
          name: string;
          icon: string | null;
          owner: boolean;
          permissions: `${bigint}`;
          features: GuildFeature[];
        }[];
      };
      loggedInLastTime?: boolean;
    } | undefined>;
    requests: Record<FeatureRequest['id'], FeatureRequest | undefined>;
  };

  botSettings?: {
    blacklist?: Snowflake[];

    defaultGuild: Record<string, unknown>;
  };

  guildSettings: Record<guildId, Record<string, unknown> | undefined>;

  userSettings: Record<userId, {
    lastVoted?: Date;
    featureRequestAutoApprove?: boolean;
  } | undefined>;
};