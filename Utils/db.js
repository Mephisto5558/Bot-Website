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

  /**@param {string}db@param {string}key*/
  async get(db, key) {
    let data = await this.schema.findOne({ key: db }).exec();
    if (key) for (const objKey of key.split('.')) {
      data = data?.[objKey];
      if (data === undefined) return data;
    }

    return data;
  }

  /**@param {string}key@param {boolean}overwrite overwrite existing collection, default: `false`@returns {value}value*/
  async set(db, value, overwrite = false) {
    if (!db) return;

    const update = { $set: { value } };
    if (!overwrite) update.$setOnInsert = { key: db };

    const data = await this.schema.findOneAndUpdate({ key: db }, update, { new: true, upsert: true }).exec();
    return data.value;
  }

  /**@param {string}db@param {string}key*/
  async update(db, key, value) {
    if (!key) return;

    const data = await this.schema.findOneAndUpdate({ key: db }, { $set: { [`value.${key}`]: value } }, { new: true, upsert: true }).exec();
    return data.value;
  }
  /**@param {string}db@param {string}key@param pushValue supports [1, 2, 3] as well as 1, 2, 3@returns {value}value*/
  async push(db, key, ...pushValue) {
    const values = pushValue.length == 1 && Array.isArray(pushValue[0]) ? pushValue[0] : pushValue;

    if (!db || !values.length) return;
    if (!Array.isArray(values)) throw Error('You can\'t push an empty or non-array value!');

    const data = await this.schema.findOneAndUpdate({ key: db }, { $push: { [`value.${key}`]: { $each: values } } }, { new: true, upsert: true }).exec();
    return data.value;
  }

  /**@param {string}db@param {string}key if no key is provided, the whole db gets deleted@returns true if the element existed or the key param is provied and false if the element did not exist*/
  async delete(db, key) {
    if (!db) return false;
    if (key) {
      await this.schema.findOneAndUpdate({ key: db }, { $unset: { [`value.${key}`]: '' } }, { new: true, upsert: true }).exec();
      return true;
    }

    await this.schema.deleteOne({ key: db }).exec();
    return true;
  }
}
