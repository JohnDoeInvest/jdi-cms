import crypto from 'node:crypto';

/**
 * Password hashing, with scrypt from node:crypto - no package for it.
 *
 * Stored as `scrypt$N$r$p$salt$hash`, salt and hash in base64url, so the cost
 * can be raised later without stranding a single account: a hash carries the
 * parameters it was made with, and `needsRehash` says when to redo it at the
 * next sign-in.
 *
 * N = 2^15 with r = 8 is 32 MB and roughly 50 ms a guess on a laptop: slow
 * enough to make a stolen database expensive to walk, quick enough that
 * nobody waits at the sign-in screen. Node's own default memory ceiling is
 * 32 MB exactly, so maxmem is raised to leave room.
 */
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEYLEN = 32;
const maxmem = (N, r) => 256 * N * r;

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 200;

const derive = (password, salt, { N, r, p }) => new Promise((resolve, reject) => {
  crypto.scrypt(String(password).normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: maxmem(N, r) },
    (err, key) => (err ? reject(err) : resolve(key)));
});

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function parse(stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return null;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(cost).every((n) => Number.isInteger(n) && n > 0)) return null;
  return { cost, salt: Buffer.from(salt, 'base64url'), hash: Buffer.from(hash, 'base64url') };
}

/* Made once, so an unknown address costs the same scrypt a known one does:
   a quick "no" would say which addresses have accounts. */
let decoy = null;
const decoyHash = async () => (decoy ??= await hashPassword(crypto.randomBytes(12).toString('hex')));

/**
 * Whether `password` matches `stored`. An empty or unreadable `stored` never
 * matches, and still takes as long to say so as a real comparison.
 */
export async function verifyPassword(password, stored) {
  const parsed = parse(stored) || parse(await decoyHash());
  const key = await derive(String(password ?? ''), parsed.salt, parsed.cost);
  const match = key.length === parsed.hash.length && crypto.timingSafeEqual(key, parsed.hash);
  return match && !!parse(stored);
}

/** Whether a stored hash was made with weaker settings than today's. */
export function needsRehash(stored) {
  const parsed = parse(stored);
  return !parsed || parsed.cost.N < COST.N || parsed.cost.r < COST.r || parsed.cost.p < COST.p;
}

/** Why a new password will not do, or '' when it will. */
export function passwordProblem(password, confirm) {
  const value = String(password ?? '');
  if (value.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (value.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;
  if (confirm !== undefined && value !== String(confirm ?? '')) return 'The two passwords do not match.';
  return '';
}
