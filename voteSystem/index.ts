/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import-x/extensions */
import { Colors, DiscordAPIError } from 'discord.js';
import { constants } from 'node:http2';
import { sanitize } from 'express-xss-sanitizer';

/* eslint-disable-next-line import-x/no-namespace */
import type * as Discord from 'discord.js';
import type { AnyDB } from '@mephisto5558/mongoose-db';
import type { Database } from '../database.js';
import type { Omit } from '../index.ts';


const {
    HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN, HTTP_STATUS_CONFLICT, HTTP_STATUS_SERVICE_UNAVAILABLE
  } = constants,

  DAYS_IN_WEEK = 7;

type Include<T, R> = T extends R ? T : never;
type RequestError = { errorCode: number; error: string };

type FeatureRequest = {
  id: `PVTI_${string}` | `${Discord.Snowflake}_${number}`;
  title: string;
  body: string;
} & (
  { votes: number; pending: undefined }
  | { votes?: number; pending: true }
);

type VoteSystemSettingsInit = {
  requireTitle?: boolean; minTitleLength?: number; maxTitleLength?: number;
  requireBody?: boolean; minBodyLength?: number; maxBodyLength?: number;
  maxPendingFeatureRequests?: number; webhookMaxVisibleBodyLength?: number;
  userChangeNotificationEmbed?: Record<'approved' | 'denied' | 'deleted' | 'updated', {
    title?: string;
    description?: string;
    color?: number | (Include<Discord.ColorResolvable, string>);
  }>;
};

export type VoteSystemSettings = Required<Omit<VoteSystemSettingsInit, 'userChangeNotificationEmbed'>> & {
  userChangeNotificationEmbed: Record<keyof NonNullable<VoteSystemSettingsInit['userChangeNotificationEmbed']>, Required<
    NonNullable<VoteSystemSettingsInit['userChangeNotificationEmbed']>[keyof NonNullable<VoteSystemSettingsInit['userChangeNotificationEmbed']>]
  >>;
};
type VoteSystemConfig = { domain: string; port?: number; votingPath: string; webhookUrl?: string; ownerIds?: string[] };

export class VoteSystem {
  /**
   * @default settings=
   * ```js
   * {
   *  requireTitle: true, minTitleLength: 0, maxTitleLength: 140,
   *  requireBody: false, minBodyLength: 0, maxBodyLength: 4000,
   *  maxPendingFeatureRequests: 5, webhookMaxVisibleBodyLength: 2000
   * }
   * ``` */
  constructor(client: Discord.Client<true>, db: AnyDB<Database>, config: VoteSystemConfig, settings: VoteSystemSettings) {
    this.client = client;
    this.db = db;
    this.config = config;
    this.settings = {
      ...this.settings,
      ...settings,
      userChangeNotificationEmbed: {
        ...this.settings.userChangeNotificationEmbed,
        ...settings.userChangeNotificationEmbed,
        approved: {
          ...this.settings.userChangeNotificationEmbed.approved,
          ...settings.userChangeNotificationEmbed.approved
        },
        denied: {
          ...this.settings.userChangeNotificationEmbed.denied,
          ...settings.userChangeNotificationEmbed.denied
        },
        deleted: {
          ...this.settings.userChangeNotificationEmbed.deleted,
          ...settings.userChangeNotificationEmbed.deleted
        },
        updated: {
          ...this.settings.userChangeNotificationEmbed.updated,
          ...settings.userChangeNotificationEmbed.updated
        }
      }
    };

    if (!client.isReady()) throw new Error('Client must be ready!');
  }

  client: Discord.Client<true>;
  db: AnyDB<Database>;
  config: VoteSystemConfig;
  settings: VoteSystemSettings = {
    /* eslint-disable @typescript-eslint/no-magic-numbers -- default values */
    requireTitle: true,
    minTitleLength: 0,
    maxTitleLength: 140,
    requireBody: false,
    minBodyLength: 0,
    maxBodyLength: 4000,
    maxPendingFeatureRequests: 5,
    webhookMaxVisibleBodyLength: 2000,
    userChangeNotificationEmbed: {
      approved: {
        title: 'New Approved Feature Request',
        description: '',
        color: Colors.Blue
      },
      denied: {
        title: 'Feature Request has been denied',
        description: '',
        color: Colors.Red
      },
      deleted: {
        title: 'Feature Request has been deleted',
        description: '',
        color: Colors.Red
      },
      updated: {
        title: 'Feature Requests have been edited',
        description: 'The following feature request(s) have been edited by a developer:',
        color: Colors.Orange
      }
    }

    /* eslint-enable @typescript-eslint/no-magic-numbers */
  };

  async fetchAll(): Promise<FeatureRequest[]> {
    return Object.values(await this.db.get('website', 'requests') ?? {}) as FeatureRequest[];
  }

  async get(id: FeatureRequest['id']): Promise<FeatureRequest | undefined> {
    return this.db.get('website', `requests.${id}`);
  }

  async #update(id: FeatureRequest['id'], data: FeatureRequest): Promise<void> {
    return void await this.db.update('website', `requests.${id}`, data);
  }

  async getMany(
    amount: number, offset = 0, filter = '', includePending = false, userId: Discord.Snowflake | '' = ''
  ): Promise<{ cards: FeatureRequest[]; moreAvailable: boolean }> {
    /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- left side is a boolean check */
    const cards = (await this.fetchAll()).filter(e => ((includePending && this.config.ownerIds?.includes(userId)) || !e.pending)
      && (e.title.includes(filter) || e.body.includes(filter) || e.id.includes(filter)));

    return {
      cards: amount ? cards.slice(offset, offset + amount) : cards.slice(offset),
      moreAvailable: !!(amount && cards.length > offset + amount)
    };
  }

  async add(title: string, body: string, userId: Discord.Snowflake): Promise<FeatureRequest | RequestError> {
    const error = this.validate(userId);
    if (error) return error;

    title = sanitize(title.trim());
    body = sanitize(body.trim());

    const err = this.constructor.validateContent(this.settings, title, body);
    if (err) return err;

    const featureRequestAutoApprove = this.db.get('userSettings', `${userId}.featureRequestAutoApprove`);
    if (
      !featureRequestAutoApprove
      && Object.keys(this.db.cache.filter((_, k) => this.constructor.getRequestAuthor(k) == userId)).length >= this.settings.maxPendingFeatureRequests
    ) {
      return {
        errorCode: HTTP_STATUS_FORBIDDEN,
        error: `You may only have up to ${this.settings.maxPendingFeatureRequests} pending feature requests`
      };
    }

    const id = `${userId}_${Date.now()}`;
    await this.#update(id, { id, title, body, ...featureRequestAutoApprove ? {} : { pending: true } });

    if (featureRequestAutoApprove) {
      await this.sendToWebhook(
        'New Approved Feature Request',
        this.constructor.formatDesc({ title, body }, this.settings.webhookMaxVisibleBodyLength), Colors.Blue, `?q=${id}`
      );
    }
    else await this.sendToWebhook('New Pending Feature Request', undefined, Colors.Blue, `?q=${id}`);

    return { title, body, id, approved: featureRequestAutoApprove };
  }

  async approve(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<FeatureRequest | RequestError> {
    const error = this.validate(userId, true);
    if (error) return error;

    const featureReq: FeatureRequest = this.get(featureId);
    if (!featureReq.pending) return { errorCode: HTTP_STATUS_CONFLICT, error: 'This feature request is already approved.' };

    featureReq.votes ??= 0;
    delete featureReq.pending;

    await this.#update(featureId, featureReq);

    void this.sendToWebhook(
      this.settings.userChangeNotificationEmbed.approved.title,
      this.constructor.formatDesc(featureReq, this.settings.webhookMaxVisibleBodyLength),
      this.settings.userChangeNotificationEmbed.approved.color,
      `?q=${featureId}`
    );
    void this.notifyAuthor(featureReq, 'approved');

    return featureReq;
  }

  async update(features: FeatureRequest | FeatureRequest[], userId: Discord.Snowflake): Promise<
    { success: true } | RequestError | { errorCode: typeof HTTP_STATUS_BAD_REQUEST; errors: { id: FeatureRequest['id']; error: string }[] }
  > {
    const error = this.validate(userId, true);
    if (error) return error;

    if (!Array.isArray(features)) features = [features];

    const
      promiseList = [], errorList: { id: FeatureRequest['id']; error: string }[] = [];

    for (const { id, title: oTitle, body, pending } of features) {
      if (!this.get(id)) {
        errorList.push({ id, error: 'Unknown feature request ID.' });
        break;
      }

      const
        title = sanitize(oTitle.trim()),
        err = this.constructor.validateContent(this.settings, title, body.trim());

      if (err) {
        errorList.push({ id, error: err.error });
        break;
      }

      const data = { ...this.get(id), title, body: sanitize(body.trim()) };
      if (pending !== undefined) data.pending = pending;

      if (userId != this.constructor.getRequestAuthor(id)) void this.notifyAuthor(data, 'updated');
      promiseList.push(this.db.update('website', `requests.${id}`, data));
    }

    await Promise.allSettled(promiseList);

    const url = this.config.domain + (this.config.port ?? 0 ? `:${this.config.port}` : '') + `/${this.config.votingPath}`;
    void this.sendToWebhook(
      this.settings.userChangeNotificationEmbed.updated.title,
      this.settings.userChangeNotificationEmbed.updated.description
      + features.reduce((acc, { id }) => errorList.some(e => e.id == id) ? acc : `${acc}\n- [${id}](${url}?q=${id})`, '\n'),
      this.settings.userChangeNotificationEmbed.updated.color
    );

    return errorList.length ? { errorCode: HTTP_STATUS_BAD_REQUEST, errors: errorList } : { success: true };
  }

  async delete(featureId: FeatureRequest['id'], userId: Discord.Snowflake): Promise<{ success: true } | RequestError> {
    const
      requestAuthor = this.constructor.getRequestAuthor(featureId),
      error = this.validate(userId, requestAuthor, featureId);

    if (error) return error;

    /** -- gets checked for validity in `this.validate()` */
    const featureReq: FeatureRequest = this.get(featureId);

    await this.db.delete('website', `requests.${featureId}`);
    void this.sendToWebhook(
      this.settings.userChangeNotificationEmbed[featureReq.pending ? 'denied' : 'deleted'].title
      + ` by ${requestAuthor == userId ? 'the author' : 'a dev'}`,
      this.constructor.formatDesc(featureReq, this.settings.webhookMaxVisibleBodyLength),
      this.settings.userChangeNotificationEmbed[featureReq.pending ? 'denied' : 'deleted'].color
    );
    if (requestAuthor != userId) void this.notifyAuthor(featureReq, featureReq.pending ? 'denied' : 'deleted');

    return { success: true };
  }

  async addVote(featureId: FeatureRequest['id'], userId: Discord.Snowflake, type: 'up' | 'down' = 'up'): Promise<FeatureRequest | RequestError> {
    const error = this.validate(userId, featureId);
    if (error) return error;
    if (!['up', 'down'].includes(type)) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Invalid vote type. Use "up" or "down"' };

    const { lastVoted } = this.db.get('userSettings', userId) ?? {};
    if (this.constructor.isInCurrentWeek(lastVoted)) return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You can only vote once per week.' };

    /** -- gets checked for validity in `this.validate()` */
    const featureReq: FeatureRequest = this.get(featureId);
    featureReq.votes = (featureReq.votes ?? 0) + (type == 'up' ? 1 : -1);

    await this.db.update('website', `requests.${featureId}.votes`, featureReq.votes);
    await this.db.update('userSettings', `${userId}.lastVoted`, new Date());

    await this.sendToWebhook(
      `Feature Request has been ${type} voted`, featureReq.title + `\n\nVotes: ${featureReq.votes} `, Colors.Blurple, `?q=${featureId}`
    );

    return featureReq;
  }

  async sendToWebhook(
    title: string, description: string, color: number = Colors.White, url = ''
  ): Promise<{ success: boolean } | RequestError> {
    if (!this.config.webhookUrl) return { errorCode: HTTP_STATUS_SERVICE_UNAVAILABLE, error: 'The backend has no webhook url configured' };

    const
      websiteUrl = this.config.domain + (this.config.port ?? 0 ? `:${this.config.port}` : ''),
      res = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Teufelsbot Feature Requests',
          /* eslint-disable-next-line camelcase */
          avatar_url: `${websiteUrl}/favicon.ico`,
          embeds: [{ url: `${websiteUrl}/${this.config.votingPath}${url}`, title, description, color }]
        })
      });

    return { success: res.ok };
  }

  async notifyAuthor(feature: FeatureRequest, mode: keyof VoteSystemSettings['userChangeNotificationEmbed']): Promise<void> {
    const
      embedData = this.settings.userChangeNotificationEmbed,
      websiteUrl = this.config.domain + (this.config.port ?? 0 ? `:${this.config.port}` : '') + '/' + this.config.votingPath,
      userId = VoteSystem.getRequestAuthor(feature);

    if (!userId) return;

    try {
      await this.client.users.send(userId, {
        embeds: [{
          ...embedData[mode],
          description: `${embedData[mode].description ?? ''}\n\n"${feature.title}"\n${websiteUrl}?q=${feature.id}`
        }]
      });
    }
    catch (rawErr) {
      const
        err = rawErr instanceof Error ? rawErr : new Error(String(rawErr)),
        UNKNOWN_USER = 10_013,
        CANNOT_SEND = 50_007;

      if (!(err instanceof DiscordAPIError) || ![UNKNOWN_USER, CANNOT_SEND].includes(err.code as number)) throw err;
    }
  }

  async validate(
    userId?: Discord.Snowflake, requireBeingOwner?: boolean | Discord.Snowflake, featureId?: FeatureRequest['id']
  ): Promise<RequestError | undefined> {
    if (!userId) return { errorCode: HTTP_STATUS_UNAUTHORIZED, error: 'User ID is missing.' };
    if ((await this.db.get('botSettings', 'blacklist'))?.includes(userId))
      return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You have been blacklisted from using the bot.' };
    if (!(requireBeingOwner === userId || this.config.ownerIds?.includes(userId)))
      return { errorCode: HTTP_STATUS_FORBIDDEN, error: 'You do not have permission to perform this action.' };

    /* eslint-disable-next-line prefer-rest-params -- only proper way to check if the param was given, independent of its type. */
    if (2 in arguments) {
      if (!featureId) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Feature ID is missing.' };
      if (!await this.get(featureId)) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: 'Unknown featureReq ID.' };
    }
  }

  static validateContent(settings: VoteSystemSettings, title?: string, body?: string): RequestError | undefined {
    let err;
    if (settings.requireTitle && !title) err = '"title" is required.';
    else if (settings.requireBody && !body) err = '"body" is required.';
    else if (title && title.length > settings.maxTitleLength) err = `"title" may not be longer than ${settings.maxTitleLength} characters.`;
    else if (title && title.length < settings.minTitleLength) err = `"title" may not be shorter than ${settings.minTitleLength} characters.`;
    else if (body && body.length > settings.maxBodyLength) err = `"body" may not be longer than ${settings.maxBodyLength} characters.`;
    else if (body && body.length < settings.minBodyLength) err = `"body" may not be shorter than ${settings.minBodyLength} characters.`;

    if (err) return { errorCode: HTTP_STATUS_BAD_REQUEST, error: err };
  }

  static formatDesc({ title = '', body = '' }: { title?: string; body?: string }, maxVisibleBodyLength = Infinity): string {
    return `**${title}**\n\n${body.length > maxVisibleBodyLength ? body.slice(maxVisibleBodyLength) + '...' : body}`;
  }

  static isInCurrentWeek(date: Discord.DateResolvable): boolean {
    if (date == 0) return false;

    const
      targetDate = new Date(date),
      today = new Date(),
      firstDayOfWeek = new Date();

    firstDayOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -DAYS_IN_WEEK + 1 : 1));

    const nextWeek = new Date(firstDayOfWeek);
    nextWeek.setDate(firstDayOfWeek.getDate() + DAYS_IN_WEEK);

    return targetDate >= firstDayOfWeek && targetDate < nextWeek;
  }

  static getRequestAuthor(request: FeatureRequest | FeatureRequest['id']): Discord.Snowflake | '' {
    const userId = (typeof request == 'string' ? request : request.id).split('_')[0];
    return Number.isNaN(Number(userId)) ? '' : userId as Discord.Snowflake;
  }
}