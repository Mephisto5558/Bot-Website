import Mongoose from 'mongoose';
import { get } from 'http';

export default class DB {
  constructor(dbConnectionString) {
    if (Mongoose.connection.readyState !== 1) {
      if (!dbConnectionString) throw new Error('A Connection String is required!');
      Mongoose.connect(dbConnectionString);
    }
  }

  schema = Mongoose.model('db-collection', new Mongoose.Schema({
    key: String,
    value: Mongoose.SchemaTypes.Mixed
  }));

  get = key => this.schema.findOne({ key }).then(e => e.value);

  set(key, value) {
    if (!key) return;
    this.schema.findOne({ key }, (err, data) => {
      if (err) throw err;
      if (data) data.value = value;
      else data = new this.schema({ key, value });

      data.save();
      if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
    });
  }

  delete(key) {
    if (!key) return;
    this.schema.findOne({ key }, async (err, data) => {
      if (err) throw err;
      if (data) {
        await data.delete();
        if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
      }
    });
  }

  push(key, ...pushValue) {
    if (!pushValue?.length) return;
    this.schema.findOne({ key }, (err, res) => {
      if (err) throw err;
      if (!Array.isArray(res.value)) throw Error(`You cant push data to a ${typeof data} value!`);

      res.value = [...res.value, ...pushValue.flat()];
      res.save();
      if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
    });
  }
}