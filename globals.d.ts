import type express from 'express'
import type Discord from 'discord.js'
import type DB from './Utils/db'
import type VoteSystem from './Utils/VoteSystem'

declare global {
  type Req = express.Request;
  type Res = express.Response;
  type Client = Discord.Client;
}

declare module 'discord.js' {
  interface BaseClient {
    db: DB;
    voteSystem: VoteSystem;
  }
}