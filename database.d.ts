import type { Snowflake, APIUser, GuildFeature } from 'discord.js';
import type { SessionData } from 'express-session';
import type { Profile } from 'passport-discord';
import { FeatureRequest } from '.';

export { Database };

type Database = {
  website: {
    sessions: {
      [sessionId: string]: SessionData & {
        passport?: {
          user: {
            id: Profile['id'];
            username: Profile['username'];
            locale: Profile['locale'];
            avatar: Profile['avatar'];
            banner: Profile['banner'];
          };
        };

        /** from `discord-dashboard` */
        discordAuthStatus?: {
          loading: boolean;
          success: boolean;
          state: {
            error: unknown?;
            data: unknown?;
          };
        };
        redirectURL?: string;
        r?: string;
        user?: APIUser & {
          public_flags: number;
          flags: number;
          avatar_decoration_data: {
            asset: string;
            sku_id: string;
          }?;
          banner_color: `#${number}`?;
          tag: `${string}#${number}`;
          avatarURL: string;
        };
        loggedInLastTime?: boolean;
        guilds?: {
          id: Snowflake;
          name: string;
          icon: string?;
          owner: boolean;
          permissions: `${bigint}`;
          features: GuildFeature[];
        }[];
        errors?: unknown?;
        success?: boolean?;
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