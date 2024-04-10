import type { Snowflake, APIUser, GuildFeature } from 'discord.js';
import type { Cookie } from 'express-session';
import { FeatureRequest } from '.';

export { Database };

type Database = {
  website: {
    sessions: {
      [sessionId: string]: {
        cookie: Cookie;
        r?: string;
        redirectURL?: string;
        discordAuthStatus?: {
          loading: boolean;
          success: boolean;
          state: {
            error: string?;
            data: string?;
          };
        };
        user?: APIUser & {
          avatar_decoration_data: {
            asset: string;
            sku_id: string;
          }?;
          banner_color: `#${number}`?;
          tag: `${string}#${number}`;
          avatarURL: string?;
          guilds: {
            id: Snowflake;
            name: string;
            icon: string?;
            owner: boolean;
            permissions: `${bigint}`;
            features: GuildFeature[];
          }[];
        };
        loggedInLastTime?: boolean;
      } | undefined;
    };
    requests: {
      [requestId: FeatureRequest['id']]: FeatureRequest | undefined;
    };
  };

  botSettings?: {
    blacklist?: Snowflake[];
  };

  guildSettings: {
    default: Record<string, unknown>;
    [guildId: Snowflake]: Record<string, unknown> | undefined;
  };

  userSettings: {
    [userId: Snowflake]: {
      lastVoted?: Date;
      featureRequestAutoApprove?: boolean;
    } | undefined;
  };
};