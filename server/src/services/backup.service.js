const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const env = require('../config/env');
const { Backup } = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

fs.mkdirSync(env.backupDir, { recursive: true });

const SKIP = new Set(['backups', 'refreshtokens']);
const SAFE_NAME = /^[A-Za-z0-9._-]+\.json\.gz$/;

/** Full database backup as gzipped Extended JSON (portable, no mongodump needed). */
async function create(req, { type = 'manual', notes } = {}) {
  const db = mongoose.connection.db;
  const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !SKIP.has(n) && !n.startsWith('system.'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${stamp}.json.gz`;
  const filePath = path.join(env.backupDir, fileName);
  const gz = zlib.createGzip();
  const out = fs.createWriteStream(filePath);
  gz.pipe(out);
  const write = (s) => new Promise((resolve) => { if (!gz.write(s)) gz.once('drain', resolve); else resolve(); });
  let documents = 0;
  await write(`{"format":"fashion-pos-backup","version":1,"createdAt":"${new Date().toISOString()}","collections":{`);
  for (let i = 0; i < cols.length; i += 1) {
    const name = cols[i];
    await write(`${i ? ',' : ''}${JSON.stringify(name)}:[`);
    const cursor = db.collection(name).find({});
    let first = true;
    for await (const doc of cursor) {
      await write(`${first ? '' : ','}${EJSON.stringify(doc, { relaxed: false })}`);
      first = false;
      documents += 1;
    }
    await write(']');
  }
  await write('}}');
  gz.end();
  await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
  const size = fs.statSync(filePath).size;
  const doc = await Backup.create({ fileName, size, collections: cols.length, documents, type, createdBy: req.user?._id, createdByName: req.user?.name, notes });
  if (req.user) await audit.log(req, { action: 'backup.create', entity: 'Backup', entityId: doc._id, refNo: fileName, newValue: { size, documents } });
  return doc;
}

const list = () => Backup.find().sort({ createdAt: -1 }).limit(200).lean();

async function filePath(id) {
  const b = await Backup.findById(id).lean();
  if (!b) throw ApiError.notFound('Backup not found');
  if (!SAFE_NAME.test(b.fileName)) throw ApiError.badRequest('Invalid backup file');
  const p = path.join(env.backupDir, b.fileName);
  if (!fs.existsSync(p)) throw ApiError.notFound('Backup file is missing on the server');
  return { path: p, backup: b };
}

function parseBackup(buffer) {
  let text;
  try {
    text = zlib.gunzipSync(buffer).toString('utf8');
  } catch {
    text = buffer.toString('utf8');
  }
  let data;
  try {
    data = EJSON.parse(text, { relaxed: false });
  } catch {
    throw ApiError.badRequest('Backup file is corrupted or not a valid backup');
  }
  if (data.format !== 'fashion-pos-backup' || !data.collections) throw ApiError.badRequest('Not a Unizova POS backup file');
  return data;
}

/** Restores the whole database from a backup (a safety backup of the current state is taken first). */
async function restore(req, { id, buffer, originalName }) {
  let buf = buffer;
  let source = originalName;
  if (id) {
    const f = await filePath(id);
    buf = fs.readFileSync(f.path);
    source = f.backup.fileName;
  }
  if (!buf) throw ApiError.badRequest('Select a backup to restore');
  const data = parseBackup(buf);
  const safety = await create(req, { type: 'pre_restore', notes: `Automatic backup before restoring ${source}` });
  const db = mongoose.connection.db;
  let restored = 0;
  for (const [name, docs] of Object.entries(data.collections)) {
    if (SKIP.has(name)) continue;
    const col = db.collection(name);
    await col.deleteMany({});
    for (let i = 0; i < docs.length; i += 1000) {
      const chunk = docs.slice(i, i + 1000);
      if (chunk.length) await col.insertMany(chunk, { ordered: false });
    }
    restored += docs.length;
  }
  // make sure indexes exist after restore
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch(() => null)));
  require('./settings.service').clearCache();
  if (id) await Backup.updateOne({ _id: id }, { restoredAt: new Date(), restoredByName: req.user.name });
  if (!id) {
    // keep uploaded file in history too
    const fileName = `uploaded-${Date.now()}.json.gz`;
    fs.writeFileSync(path.join(env.backupDir, fileName), zlib.gzipSync(buf.length && buf[0] === 0x1f ? zlib.gunzipSync(buf) : buf));
    await Backup.create({ fileName, size: buf.length, collections: Object.keys(data.collections).length, documents: restored, type: 'uploaded', createdBy: req.user._id, createdByName: req.user.name, restoredAt: new Date(), restoredByName: req.user.name, notes: `Uploaded: ${originalName}` });
  }
  await audit.log(req, { action: 'backup.restore', entity: 'Backup', refNo: source, newValue: { documents: restored, safetyBackup: safety.fileName } });
  return { restored, safetyBackup: safety.fileName };
}

async function remove(req, id) {
  const f = await filePath(id).catch(() => null);
  if (f) fs.unlinkSync(f.path);
  await Backup.deleteOne({ _id: id });
  await audit.log(req, { action: 'backup.delete', entity: 'Backup', entityId: id });
}

module.exports = { create, list, filePath, restore, remove };
