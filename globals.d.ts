import type DB from './Utils/db'

declare module "discord.js" {
  interface BaseClient {
    db: DB
  }
}