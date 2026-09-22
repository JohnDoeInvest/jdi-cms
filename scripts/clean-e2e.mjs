/**
 * Remove anything an interrupted e2e run left behind.
 *
 *   npm run test:clean
 *
 * Works directly on the database, so the server does not need to be running.
 */
import { run } from '../src/db/index.js';
import { pages, articles, slices, categories, menus, forms, users } from '../src/models.js';

const isTest = (name) => /^E2E[-\s]/i.test(String(name || ''));
let removed = 0;

for (const p of pages.list()) if (isTest(p.title)) { pages.remove(p.id); removed++; }
for (const a of articles.list()) if (isTest(a.title)) { articles.remove(a.id); removed++; }
for (const s of slices.list()) if (isTest(s.name)) { slices.remove(s.id); removed++; }
for (const m of menus.list()) if (isTest(m.name)) { menus.remove(m.id); removed++; }
for (const f of forms.list()) if (isTest(f.name)) { forms.remove(f.id); removed++; }
for (const c of categories.list()) if (isTest(c.name)) { categories.remove(c.id); removed++; }
for (const u of users.list()) if (/@exempel\.se$/i.test(u.email)) { users.remove(u.id); removed++; }
const messages = run("DELETE FROM messages WHERE from_email LIKE '%@exempel.se'");
removed += messages.changes;

console.log(`Removed ${removed} leftover test record(s).`);
