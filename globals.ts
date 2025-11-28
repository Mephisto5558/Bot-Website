import type { Guild } from 'discord.js';
import type { Profile as PProfile } from 'passport-discord-auth';

type SnowflakeType = `${bigint}`;

/* eslint-disable @typescript-eslint/ban-ts-comment, sonarjs/redundant-type-aliases
  -- depending on the module resolution, one of these might not error out.
  Using `../../` because the content lands in `dist/`
  */// @ts-expect-error
declare module '../../node_modules/discord.js/node_modules/discord-api-types/v10.d.ts' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = SnowflakeType;
}
declare module 'discord-api-types/v10' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = SnowflakeType;
}
/* eslint-enable @typescript-eslint/ban-ts-comment, sonarjs/redundant-type-aliases */

declare module 'discord-dashboard' {
  /* eslint-disable @typescript-eslint/consistent-type-definitions -- required for type merging */
  interface optionOptions {
    guild: { id: SnowflakeType; object: Guild };
    user: { id: SnowflakeType };
    newData?: unknown;
  }

  interface allowedCheckOption {
    guild: { id: SnowflakeType };
    user: { id: SnowflakeType };
  }
}

declare module 'passport-discord-auth' {
  interface Profile {
    id: SnowflakeType;
  }
}

declare global {
  namespace Express {
    /* eslint-disable-next-line @typescript-eslint/no-empty-object-type -- needs to be an interface */
    interface User extends PProfile {}
  }
  /* eslint-enable @typescript-eslint/consistent-type-definitions */
}