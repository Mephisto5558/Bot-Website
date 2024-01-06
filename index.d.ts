import type Discord from 'discord.js'
import type express from 'express'
import type { DB } from '@mephisto5558/mongoose-db';
import type { Dirent } from 'fs';
import type { PassportStatic } from 'passport';
import type { MemoryStore } from 'express-session'
import type { formTypes } from 'discord-dashboard'
import type VoteSystem from './Utils/VoteSystem'

export { WebServer }
export default WebServer


type Support = { mail?: string, discord?: string }
type Keys = { secret: string, dbdLicense: string, webhookURL: string }

class WebServer {
  constructor(
    client: Discord.Client, db: DB, keys: Keys,
    config?: {
      support?: Support; port?: number; domain?: string; errorPagesDir?: string;
      settingsPath?: string; customPagesPath?: string;
    },
    errorLoggingFunction?: (err: Error, req: Req, res: Res) => any
  );

  client: Discord.Client<true>;
  db: DB;
  config: {
    support: Support; port: number; domain: string; errorPagesDir?: string;
    settingsPath: string, customPagesPath: string
  };
  keys: Keys;
  initiated: boolean;

  passport: PassportStatic?;
  sessionStore: MemoryStore?;
  dashboardOptionCount: any[]?;
  /**modified default settings of embedBuilder*/
  formTypes: (Omit<formTypes, 'embedBuilder'> & {
    embedBuilder: ReturnType<typeof formTypes['embedBuilder']>,
    _embedBuilder: formTypes['embedBuilder']
  })?;
  dashboard: Dashboard?;
  router: express.Router?;
  app: express.Express?;
  voteSystem: VoteSystem?;

  init(commands: object[]): Promise<this>;

  private #checkConstructorParams(): void;
  private #setupPassport(): void;
  private #setupSessionStore(): void;
  private #setupDashboard(settingsPath: string, commands: object[]): Promise<void>
  private #setupRouter(): void;
  private #setupApp(): void;

  sendNavigationButtons(dir: Dirent[], path: string, reqPath: string): Promise<string | undefined>

  logError(err: Error, req: Req, res: Res): any;
}
