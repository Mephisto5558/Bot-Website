import Mongoose from 'mongoose';
import { get } from 'http';
Mongoose.set('strictQuery', true);

export default class DB {
  /**@param {string}dbConnectionString MongoDB connection string*/
  constructor(dbConnectionString) {
    if (Mongoose.connection.readyState != 1) {
      if (!dbConnectionString) throw new Error('A Connection String is required!');
      Mongoose.connect(dbConnectionString);
    }
  }

  schema = Mongoose.model('db-collection', new Mongoose.Schema({
    key: String,
    value: Mongoose.SchemaTypes.Mixed
  }));

  /**@returns value of collection*/
  get = key => this.schema.findOne({ key }).then(e => e?.value);

  /**@param {string}key@param {boolean}overwrite overwrite existing collection, default: `false`*/
  async set(key, value, overwrite = false) {
    if (!key) return;
    let data;

    if (!overwrite) data = await this.schema.findOne({ key });
    if (data) data.value = value;
    else data = new this.schema({ key, value });

    await data.save();
    if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
  }

  /**@param {string}db@param {string}key*/
  async update(db, key, value) {
    if (!key) return;
    if (typeof key != 'string') throw new Error(`key must be typeof string! Got ${typeof key}.`);

    const data = await this.schema.findOne({ key: db }) || new this.schema({ key: db, value: {} });

    data.value ??= {};
    if (typeof data.value != 'object') throw new Error(`data.value in db "${db}" must be typeof object! Found ${typeof data.value}.`);

    this.constructor.mergeWithFlat(data.value, key, value);

    data.markModified(`value.${key}`);
    await data.save();
    if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
  }

  /**@param {string}key*/
  async push(key, ...pushValue) {
    const values = pushValue.flat();

    const data = await this.schema.findOne({ key }) ?? new this.schema({ key, value: pushValue });
    if (data.value && !Array.isArray(data.value)) throw Error(`You can't push data to a ${typeof data.value} value!`);
    data.value = data.value ? [...data.value, ...values] : pushValue;

    await data.save();
    if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
  }

  /**@param {string}key*/
  async delete(key) {
    if (!key) return;

    const data = await this.schema.findOne({ key });
    if (data) {
      await data.delete();
      if (process.env.BotUpdateDBURL) get(process.env.BotUpdateDBURL + `&db=${key}`);
    }
  }

  /**@param {object}obj gets mutated! @param {string}key@returns reduce return value @example DB.mergeWithFlat({a: {b:1}}, 'a.c', 2)*/
  static mergeWithFlat(obj, key, val) {
    const keys = key.split('.');
    return keys.reduce((acc, e, i) => acc[e] = keys.length - 1 == i ? val : acc[e] ?? {}, obj);
  }
};