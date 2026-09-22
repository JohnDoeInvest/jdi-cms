/**
 * Drop the database and re-seed the structure.
 *
 *   npm run reset
 *
 * Refuses to run while the server is up: deleting an open SQLite file leaves
 * the running process writing to an unlinked inode, which silently resurrects
 * the old data and produces a confusing half-state.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { config } from '../src/config.js';

const running = (() => {
  try {
    return execSync(`lsof -nP -iTCP:${config.port} -sTCP:LISTEN -t 2>/dev/null || true`)
      .toString().trim().length > 0;
  } catch { return false; }
})();

if (running) {
  console.error(`\n  The server is still listening on port ${config.port}.`);
  console.error('  Stop it first (./stop.sh, or Ctrl+C), then run this again.\n');
  process.exit(1);
}

let removed = 0;
for (const suffix of ['', '-wal', '-shm']) {
  const file = config.paths.db + suffix;
  if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
}
console.log(`Removed ${removed} database file(s).`);

const { seed } = await import('../src/db/seed.js');
await seed({ force: true });
console.log('Structure re-seeded.');
