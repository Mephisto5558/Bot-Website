import Mongoose from 'mongoose';
import { get } from 'http';

export default class DB {
  /**@param {string}dbConnectionString MongoDB connection string*/
  constructor(dbConnectionString) {
    if (Mongoose.connection.readyState !== 1) {
      if (!dbConnectionString) throw new Error('A Connection String is required!');
      return Mongoose.connect(dbConnectionString).then(() => { return this; });
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

  /**@param {string}db@param {string}key*/
  update(db, key, value) {
    if (!key) return;
    if (typeof key != 'string') throw new Error(`key must be typeof string! Got ${typeof key}.`);

    this.schema.findOne({ key: db }, (err, data) => {
      if (err) throw err;
      if (data && typeof data.value != 'object') throw new Error(`data.value in db must be typeof object! Found ${typeof data.value}.`);
      if (!data) data = new this.schema({ key, value: {} });
      DB.mergeWithFlat(data.value, key, value);

      data.markModified(`value.${key}`);
      data.save();
      if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
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

  /**@param {{}}obj gets mutated! @param {string}key@example DB.mergeWithFlat({a: {b:1} }, 'a.c', 2):{a: {b:1, c:2}}*/
  static mergeWithFlat(obj, key, val) {
    const keys = key.split('.');
    keys.reduce((acc, e, i) => acc[e] = keys.length - 1 == i ? val : acc[e] ?? {}, obj);
    return obj;
  }
}