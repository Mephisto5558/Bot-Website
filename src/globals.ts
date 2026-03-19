import type { Guild } from 'discord.js';
import type { Profile as PProfile } from 'passport-discord-auth';

import type * as __ from '@mephisto5558/better-types'; /* eslint-disable-line import-x/order, import-x/no-namespace -- load in global definitions */

/* eslint-disable @typescript-eslint/ban-ts-comment -- depending on the module resolution, one of these might not error out.
  Using `../../` because the content lands in `dist/` */
// @ts-expect-error
declare module '../../node_modules/discord.js/node_modules/discord-api-types/v10.d.ts' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = globalThis.Snowflake;
}
declare module 'discord-api-types/v10' {
  // @ts-ignore 2300 // overwriting Snowflake
  export type Snowflake = globalThis.Snowflake;
}
/* eslint-enable @typescript-eslint/ban-ts-comment */

declare module 'discord-dashboard' {
  /* eslint-disable @typescript-eslint/consistent-type-definitions -- required for type merging */
  interface optionOptions {
    guild: { id: globalThis.Snowflake; object: Guild };
    user: { id: globalThis.Snowflake };
    newData?: unknown;
  }

  interface allowedCheckOption {
    guild: { id: globalThis.Snowflake };
    user: { id: globalThis.Snowflake };
  }
}

declare module 'passport-discord-auth' {
  interface Profile {
    id: globalThis.Snowflake;
  }
}

declare global {
  namespace Express {
    /* eslint-disable-next-line @typescript-eslint/no-empty-object-type -- needs to be an interface */
    interface User extends PProfile {}
  }
  /* eslint-enable @typescript-eslint/consistent-type-definitions */
}