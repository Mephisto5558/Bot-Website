/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import-x/extensions */
/* eslint-disable import-x/max-dependencies */

import { readdir } from 'node:fs/promises';
import { constants } from 'node:http2';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import SoftUITheme from 'dbd-soft-ui';
import DBD from 'discord-dashboard';
import escapeHTML from 'escape-html';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { xss } from 'express-xss-sanitizer';
import { Authenticator } from 'passport';
import { Scope, Strategy } from 'passport-discord-auth';

/* eslint-disable-next-line import-x/no-namespace */
import * as Discord from 'discord.js';
import type { Dirent, PathLike } from 'node:fs';
import type { AnyDB } from '@mephisto5558/mongoose-db';
import type { Express, Handler, NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { Session } from 'express-session';
import type { ProfileGuild } from 'passport-discord-auth';
import type { Database, sessionId } from '../database.ts';
import type { Omit, WebServer, customPage } from '../index.ts';


export type { default as MongoStore } from './sessionStore.ts';
export type DBSession = NonNullable<Database['website']['sessions'][sessionId]>;

const
  {
    HTTP_STATUS_OK, HTTP_STATUS_MOVED_PERMANENTLY,
    HTTP_STATUS_FORBIDDEN, HTTP_STATUS_NOT_FOUND, HTTP_STATUS_METHOD_NOT_ALLOWED
  } = constants,
  RATELIMIT_MAX_REQUESTS = 100,
  RATELIMIT_MS = 6e4, // 1min in ms
  MAX_COOKIE_AGE = 3.154e10, // 1y in ms
  VIEW_COOLDOWN_MS = 3e5; // 5min in ms


type MarkOptional<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

type DashboardThemeOptions = MarkOptional<Parameters<typeof SoftUITheme>[0], 'websiteName' | 'colorScheme' | 'icons' | 'meta'>;

type DashboardOptions = {
  errorPagesDir?: string;

  /** HTML code for the 404 page */
  html404?: string;
} & MarkOptional<
  ConstructorParameters<Dashboard>[0],

  /* eslint-disable-next-line sonarjs/max-union-size */// @ts-expect-error -- Not all options are documented
  'acceptPrivacyPolicy' | 'minimizedConsoleLogs' | 'redirectUri' | 'noCreateServer'
  | 'useUnderMaintenance' | 'useCategorySet' | 'useTheme404' | 'bot' | 'client' | 'invite' | 'theme' | 'underMaintenance'
>;


export class WebServerSetupper {
  constructor(client: Discord.Client<true>, db: AnyDB<Database>, baseConfig: { clientSecret: string; baseUrl: string; defaultAPIVersion: number }) {
    this.client = client;
    this.db = db;
    this.baseConfig = baseConfig;
  }

  client: Discord.Client<true>;
  db: AnyDB<Database>;
  app!: Express;
  authenticator!: Authenticator<Handler, RequestHandler>;
  authUrl!: string;
  callbackUrl!: string;
  baseConfig: { clientSecret: string; baseUrl: string; defaultAPIVersion: number };
  dashboardTheme!: Awaited<ReturnType<WebServerSetupper['setupDashboardTheme']>>;
  dashboard!: Awaited<ReturnType<WebServerSetupper['setupDashboard']>>;
  router!: Awaited<ReturnType<WebServerSetupper['setupRouter']>>;

  setupAuth(authUrl = '/auth/discord', callbackUrl = '/auth/discord/callback'): Authenticator<Handler, RequestHandler> {
    this.authUrl = authUrl;
    this.callbackUrl = callbackUrl;

    this.authenticator = new Authenticator().use(
      new Strategy(
        {
          clientId: this.client.user.id,
          clientSecret: this.baseConfig.clientSecret,
          callbackUrl: this.callbackUrl,
          scope: [Scope.Identify, Scope.Guilds]
        },
        (_accessToken, _refreshToken, user, done) => done(undefined, user)
      )
    ) as Authenticator<Handler, RequestHandler>;

    this.authenticator.serializeUser((user: Express.User, done) => done(undefined, user));
    this.authenticator.deserializeUser((user: Express.User, done) => done(undefined, user));

    return this.authenticator;
  }

  setupDashboardTheme(config: DashboardThemeOptions): ReturnType<typeof SoftUITheme> {
    const owner = this.client.application.owner instanceof Discord.Team ? this.client.application.owner.owner?.user : this.client.application.owner;

    /* eslint-disable-next-line new-cap */
    this.dashboardTheme = SoftUITheme({
      websiteName: `${this.client.user.username} | Dashboard`,
      colorScheme: 'dark',
      icons: {
        favicon: this.client.user.displayAvatarURL(),
        sidebar: {
          darkUrl: this.client.user.displayAvatarURL(),
          lightUrl: this.client.user.displayAvatarURL()
        }
      },
      meta: {
        author: owner?.username ?? '',
        owner: owner?.username ?? ''
      },
      ...config
    });

    return this.dashboardTheme;
  }

  async setupDashboard(licenseId: string, config: DashboardOptions): Promise<Dashboard> {
    await DBD.useLicense(licenseId);

    /* eslint-disable-next-line new-cap -- UpdatedClass is none of mine (and, returns a class) */
    const DBDUpdated = DBD.UpdatedClass();

    /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
    this.dashboard = new DBDUpdated({
      acceptPrivacyPolicy: true,
      minimizedConsoleLogs: true,
      redirectUri: `${this.baseConfig.baseUrl}/discord/callback`,
      noCreateServer: true,
      useUnderMaintenance: false,
      useCategorySet: true,
      useTheme404: true,
      bot: this.client,
      client: {
        id: this.client.user.id,
        secret: this.baseConfig.clientSecret
      },
      invite: {
        scopes: this.client.application.installParams?.scopes ?? [],
        permissions: this.client.application.installParams?.permissions
      },
      theme: this.dashboardTheme,
      underMaintenance: {
        title: 'Under Maintenance',
        contentTitle: '<p id="content-title" style="color: #ddd9d9">This page is under maintenance</p>',
        texts: [
          '<br><p class="text" style="color: #ddd9d9">'
          + 'We still want to change for the better for you.<br>'
          + 'Therefore, we are introducing technical updates so that we can allow you to enjoy the quality of our services.'
          + '<br></p><br>'
        ],
        bodyBackgroundColors: ['#999', '#0f173d'],
        buildingsColor: '#6a6a6a',
        craneDivBorderColor: '#6a6a6a',
        craneArmColor: '#8b8b8b',
        craneWeightColor: '#8b8b8b',
        outerCraneColor: '#6a6a6a',
        craneLineColor: '#6a6a6a',
        craneCabinColor: '#8b8b8b',
        craneStandColors: ['#6a6a6a', undefined, '#f29b8b']
      },
      ...config
    });

    await this.dashboard.init();
    return this.dashboard;
  }

  setupRouter(customPagesPath?: string): Router {
    /* eslint-disable-next-line new-cap -- Router is a function that returns a class instance */
    const router = express.Router()

      // `@types/express-serve-static-core` has a to-do to add typing for regex paths
      .use('/api{/*path}', (req: Request<{ path: string[] }>, res, next) => {
        if (/^v\d+$/.test(req.params.path[0] as string)) return next();
        return res.redirect(HTTP_STATUS_MOVED_PERMANENTLY, `/api/v${this.baseConfig.defaultAPIVersion}/${req.params.path.join('/')}`);
      })
      .use(async (req, res, next) => {
        Object.defineProperty(req.session, 'guilds', { // Dashboard
          get(this: Session & { user?: DBSession['user'] }) { return this.user?.guilds; },
          set(this: Session & { user?: DBSession['user'] }, val: ProfileGuild[]) {
            this.user ??= {};
            this.user!.guilds = val;
          }
        });

        if (req.path == '/dashboard') return res.status(HTTP_STATUS_MOVED_PERMANENTLY).redirect('/manage');
        if (!customPagesPath) return next();

        const
          absoluteCustomPagesPath = path.resolve(process.cwd(), customPagesPath),
          parsedPath = path.parse(path.resolve(absoluteCustomPagesPath, path.normalize('.' + (req.path == '/' ? '/index' : req.path))));

        if (parsedPath.dir != absoluteCustomPagesPath && !parsedPath.dir.startsWith(absoluteCustomPagesPath + path.sep))
          return res.redirect(HTTP_STATUS_FORBIDDEN, `/error/${HTTP_STATUS_FORBIDDEN}`);

        let
          data: customPage | undefined,
          subDirs: Dirent[] | undefined;

        try { subDirs = await readdir(parsedPath.dir, { withFileTypes: true }); }
        catch { /* empty */ }

        if (subDirs?.length) {
          const subDir = subDirs.find(e => e.isFile() && e.name == parsedPath.base)
            ?? subDirs
              .filter(e => e.isFile() && path.parse(e.name).name.startsWith(parsedPath.name))
              .toSorted((a, b) => Number(b.name == parsedPath.name) - Number(a.name == parsedPath.name)
                || Number(path.extname(b.name) == '.html') - Number(path.extname(a.name) == '.html')
                || a.name.localeCompare(b.name))[0];

          if (!subDir) {
            const html = await WebServerSetupper.createNavigationButtons(path.join(parsedPath.dir, parsedPath.name), req.path);
            return void (html ? res.send(html) : next());
          }

          if (!subDir.name.endsWith('.js')) return res.sendFile(path.join(subDir.parentPath, subDir.name));

          /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- not fixable */
          data = await require(path.join(subDir.parentPath, subDir.name));
        }

        return WebServerSetupper.handleCustomSite(webServer, req, res, next, data);
      });

    this.router = router;
    return this.router;
  }

  setupApp(
    secret: string, sessionStore?: Express.SessionStore, handlers: Handler[] = [],
    config: { domain?: string; baseUrl?: string; errorPagesDir?: string } = {}
  ): Express {
    this.app = express()
      .disable('x-powered-by')
      .set('json spaces', 2)
      .set('title', this.client.user.username)
      .use(
        compression(),
        rateLimit({
          windowMs: RATELIMIT_MS,
          limit: RATELIMIT_MAX_REQUESTS,
          message: '<body style="background-color:#111;color:#ff0000">'
            + '<p style="text-align:center;top:50%;position:relative;font-size:40;">Sorry, you have been ratelimited!</p></body>'
        }),
        xss(),
        session({
          secret,
          name: 'sessionId',
          resave: false,
          saveUninitialized: false,
          store: sessionStore,
          cookie: {
            maxAge: MAX_COOKIE_AGE,
            secure: config.domain?.startsWith('https'),
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
          }
        }),
        this.authenticator.session()
      )
      .use('/api/:v/internal', cors({ origin: this.baseConfig.baseUrl }))
      .use(this.authUrl, (req, res, next) => this.authenticator.authenticate('discord', {
        failureRedirect: this.authUrl,
        successRedirect: 'redirectUrl' in req.query && req.query.redirectUrl ? req.query.redirectUrl as string : '/'
      })(req, res, next))
      .use('/auth/logout', (req, res, next) => req.logOut(err => (err ? next(err) : res.sendStatus(HTTP_STATUS_OK))))
      .use(
        async (req, _, next) => {
          // only track normal GET requests
          if (!req.user?.id || req.method != 'GET' || req.xhr || req.accepts('html') === false) return next();

          const
            pagePath = req.path.split('/').filter(Boolean).join('.') || 'root',
            viewData = await this.db.get('userSettings', `${req.user.id}.pageViews.${pagePath}`),
            now = new Date();

          if (!viewData?.lastVisited || now.getTime() - viewData.lastVisited.getTime() > VIEW_COOLDOWN_MS)
            void this.db.update('userSettings', `${req.user.id}.pageViews.${pagePath}`, { count: (viewData?.count ?? 0) + 1, lastVisited: now });

          return next();
        },
        ...handlers,
        (req, res) => {
          if (config.errorPagesDir && req.headers['user-agent']?.includes('Mozilla')) {
            return res.status(HTTP_STATUS_NOT_FOUND)
              .sendFile(path.join(config.errorPagesDir, `${HTTP_STATUS_NOT_FOUND}.html`), { root: process.cwd() });
          }

          res.sendStatus(HTTP_STATUS_NOT_FOUND);
        }
      );

    return this.app;
  }

  static handleCustomSite(
    webServer: WebServer<true>, req: express.Request, res: express.Response, next: express.NextFunction,
    data?: customPage
  ): void {
    if (!data) return next();

    /* eslint-disable-next-line @typescript-eslint/no-shadow */
    return WebServerSetupper.runParsed(req, res, next, data, async (req, res, data) => {
      if (data.method && !(typeof data.method == 'string' ? [data.method] : data.method).some(e => e.toUpperCase() == req.method)) {
        return res
          .setHeader('Allow', typeof data.method == 'string' ? data.method : data.method.join(','))
          .sendStatus(HTTP_STATUS_METHOD_NOT_ALLOWED);
      }

      if (data.permissionCheck && !await data.permissionCheck.call(req))
        return res.redirect(HTTP_STATUS_FORBIDDEN, `/error/${HTTP_STATUS_FORBIDDEN}`);

      if (data.title) res.set('title', data.title);
      if (data.static) {
        const code = String(data.run);
        return res.send(code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')));
      }
      if (typeof data.run == 'function') return data.run.call(webServer, res, req, next);
      if (data.run instanceof URL) return res.redirect(data.run.toString());

      return res.send(JSON.stringify(data.run ?? data));
    });
  }

  static async createNavigationButtons(dirPath: PathLike, reqPath: string): Promise<string | undefined> {
    const dir = await readdir(dirPath, { withFileTypes: true }).catch(() => { /* emtpy */ });
    if (!dir) return;

    return dir.reduce((acc, file) => {
      const name = file.isFile() ? file.name.split('.').slice(0, -1).join('.') : file.name;

      let title: string | undefined;
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- cannot be typed */
      try { title = require(path.join(dirPath, file.name))?.title; }
      catch { /** handled by `title ??=` */ }

      title ??= name[0].toUpperCase() + name.slice(1).replaceAll(/[-_]/g, ' ');

      // '//' can be on dirs and on the `reqPath`'s start
      return `${acc}<a href="${path.posix.join(reqPath, encodeURIComponent(name))}">${escapeHTML(title)}</a>`;
    }, '<link rel="stylesheet" href="https://mephisto5558.github.io/Website-Assets/min/css/navButtons.css" crossorigin="anonymous" /><div class="navButton">') + '</div>';
  }

  static runParsed<REQ extends Request, RES extends Response, PAGE extends customPage>(
    req: REQ, res: RES, next: NextFunction, data: PAGE,
    fn: (req: REQ, res: RES, data: PAGE) => void
  ): void {
    return express.json({ limit: '100kb' })(req, res, err => {
      if (err) return next(err);

      return express.urlencoded({ extended: true, limit: '100kb' })(req, res, err => {
        if (err) return next(err);
        return fn(req, res, data);
      });
    });
  }
}