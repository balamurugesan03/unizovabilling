const http = require('http');
const mongoose = require('mongoose');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const socket = require('./socket');
const { Permission, Role } = require('./models');
const { PERMISSIONS, ALL_PERMISSIONS, normalizePermissions } = require('./constants/permissions');

async function syncPermissions() {
  await Permission.bulkWrite(PERMISSIONS.map((p) => ({ updateOne: { filter: { key: p.key }, update: { $set: p }, upsert: true } })));
  await Permission.deleteMany({ key: { $nin: PERMISSIONS.map((p) => p.key) } });
  // roles saved with the older "manage" keys get the matching module-wise view/create/edit/delete keys
  const roles = await Role.find().select('code permissions');
  for (const role of roles) {
    const next = role.code === 'super_admin' ? ALL_PERMISSIONS : normalizePermissions(role.permissions);
    if (next.length !== role.permissions.length || next.some((k, i) => k !== role.permissions[i])) {
      role.permissions = next;
      await role.save();
    }
  }
}

async function start() {
  await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await syncPermissions();
  const server = http.createServer(app);
  socket.init(server);
  server.listen(env.port, () => console.log(`[server] Unizova POS API listening on http://localhost:${env.port} (${env.nodeEnv})`));

  const shutdown = async (sig) => {
    console.log(`[server] ${sig} received, shutting down`);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((e) => {
  console.error('[server] failed to start', e);
  process.exit(1);
});
