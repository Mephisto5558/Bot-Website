import type express from 'express'
import type Discord from 'discord.js'

declare global {
  type Req = express.Request;
  type Res = express.Response;
  type Client = Discord.Client;
}