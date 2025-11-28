declare global {
  // Source: https://github.com/Mephisto5558/Teufelsbot/blob/a9e4dff37841380bf4577e934081eb619e127c2e/types/globals.d.ts#L83-L98
  type KeyToString<K extends PropertyKey> = K extends string ? K : K extends number ? `${K}` : never;

  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required for type merging */
  interface ObjectConstructor {
    keys<K extends PropertyKey, V>(o: [K, V] extends [never, never] ? never : Record<K, V>): KeyToString<K>[]; // handles things like enums
    keys<T>(o: T): KeyToString<keyof T>[];

    values<K extends PropertyKey, V>(o: [K, V] extends [never, never] ? never : Record<K, V>): V[]; // handles things like enums
    values<T>(o: T): ({
      [K in keyof T]: undefined extends T[K] ? T[K] : Required<T>[K]
    } extends { [_ in keyof T]: infer V } ? V : never)[];

    entries<K extends PropertyKey, V>(o: [K, V] extends [never, never] ? never : Record<K, V>): [KeyToString<K>, V][]; // handles things like enums
    entries<T>(o: T): ({
      [K in keyof T]: undefined extends T[K] ? T[K] : Required<T>[K]
    } extends { [_ in keyof T]: infer V } ? [KeyToString<keyof T>, V] : never)[];
  }
}

/* eslint-disable-next-line unicorn/require-module-specifiers */
export {};