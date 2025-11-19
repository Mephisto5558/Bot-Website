import type { Guild, User } from 'discord.js';
import type { Profile as PProfile } from 'passport-discord-auth';

/* eslint-disable @typescript-eslint/ban-ts-comment -- depending on the module resolution, one of these might not error out. */// @ts-expect-error
declare module '../node_modules/discord.js/node_modules/discord-api-types/v10.d.ts' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = `${bigint}`;
}
declare module 'discord-api-types/v10' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = `${bigint}`;
}
/* eslint-enable @typescript-eslint/ban-ts-comment */

declare module 'discord-dashboard' {
  /* eslint-disable @typescript-eslint/consistent-type-definitions -- required for type merging */
  interface optionOptions {
    guild: { id: Guild['id']; object: Guild };
    user: { id: User['id'] };
    newData?: unknown;
  }

  interface allowedCheckOption {
    guild: { id: Guild['id'] };
    user: { id: User['id'] };
  }
}

declare module 'passport-discord-auth' {
  interface Profile {
    id: User['id'];
  }
}

declare global {
  namespace Express {
    /* eslint-disable-next-line @typescript-eslint/no-empty-object-type -- needs to be an interface */
    interface User extends PProfile {}
  }
  /* eslint-enable @typescript-eslint/consistent-type-definitions */
}