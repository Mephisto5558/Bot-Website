import type { APIUser, GuildFeature } from 'discord.js';
import type { Cookie } from 'express-session';
import type { FeatureRequest } from '.';

export type { Database };

type Snowflake = `${number}`;

type sessionId = string;
type requestId = FeatureRequest['id'];
type guildId = Snowflake;
type userId = Snowflake;

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
    requests: Record<requestId, FeatureRequest | undefined>;
  };

  botSettings?: {
    blacklist?: Snowflake[];
  };

  guildSettings: {
    default: Record<string, unknown>;
    [guildId: guildId]: Record<string, unknown> | undefined;
  };

  userSettings: Record<userId, {
    lastVoted?: Date;
    featureRequestAutoApprove?: boolean;
  } | undefined>;
};