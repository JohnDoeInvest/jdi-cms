import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { esc } from './html.js';

/**
 * Mail + SMS delivery.
 *
 * With BREVO_API_KEY set, messages go out through Brevo's transactional API.
 * Without it, every message is written to data/outbox/ and echoed to the
 * console, so the full login and contact flow is testable offline.
 */

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function toOutbox(kind, meta, body) {
  const file = path.join(config.paths.outbox, `${stamp()}-${kind}.txt`);
  const header = Object.entries(meta).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join('\n');
  fs.writeFileSync(file, `${header}\n${'-'.repeat(60)}\n${body}\n`);
  return file;
}

async function brevo(endpoint, payload) {
  const res = await fetch(`https://api.brevo.com/v3/${endpoint}`, {
    method: 'POST',
    headers: {
      'api-key': config.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo ${endpoint} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendMail({ to, subject, html, text, replyTo }) {
  const plain = text || html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (!config.brevoApiKey) {
    const file = toOutbox('email', { from: config.mail.fromEmail, to, subject, replyTo: replyTo || '-' }, plain);
    console.log(`  [mail] -> ${to} | ${subject}\n         saved: ${path.relative(config.root, file)}`);
    return { delivered: false, outbox: file };
  }

  await brevo('smtp/email', {
    sender: { name: config.mail.fromName, email: config.mail.fromEmail },
    to: [{ email: to }],
    ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    subject,
    htmlContent: html || `<p>${esc(plain)}</p>`,
    textContent: plain,
  });
  console.log(`  [mail] sent via Brevo -> ${to} | ${subject}`);
  return { delivered: true };
}

export async function sendSms({ to, text }) {
  if (!config.brevoApiKey) {
    const file = toOutbox('sms', { sender: config.mail.fromName, to }, text);
    console.log(`  [sms]  -> ${to}\n         saved: ${path.relative(config.root, file)}`);
    return { delivered: false, outbox: file };
  }
  await brevo('transactionalSMS/sms', {
    sender: 'SmartareMat',           // Brevo alphanumeric senders max 11 chars
    recipient: to.replace('+', ''),
    content: text,
    type: 'transactional',
  });
  return { delivered: true };
}

/* ---------------------------------------------------------------- templates */

const shell = (body) => `<!doctype html>
<html lang="sv"><body style="margin:0;padding:32px;background:#f0ede8;font-family:Helvetica,Arial,sans-serif;color:#1e1e1e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#fff;border-radius:16px;padding:36px 40px">
      ${body}
      <tr><td style="padding-top:28px;border-top:1px solid #e6e2da;color:#6b6b6b;font-size:12px;line-height:1.6">
        Smartare Mat i Sverige AB (publ) &middot; Mantorp<br>
        Det h&auml;r meddelandet gick till dig fr&aring;n ett automatiskt system.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

/** Frame 4.3 - one-time token e-mail. */
export const otpEmail = (code) => ({
  subject: 'Din engångskod',
  html: shell(`
      <tr><td style="font-size:22px;font-weight:700;letter-spacing:-.02em;padding-bottom:20px">Din engångskod</td></tr>
      <tr><td style="font-size:34px;font-weight:700;letter-spacing:.22em;color:#1e1e1e;
                     background:#f7cd4b;border-radius:12px;padding:18px 24px;text-align:center">${esc(code)}</td></tr>
      <tr><td style="padding-top:24px;font-size:14px;color:#545454;line-height:1.6">
        Koden är giltig i ${config.otp.ttlMinutes} minuter.<br>
        Om du inte försökte logga in kan du bortse från det här meddelandet.
      </td></tr>`),
  text: `Din engångskod: ${code}\nKoden är giltig i ${config.otp.ttlMinutes} minuter.`,
});

/** Frame 4.3 - one-time token SMS. */
export const otpSms = (code) => `Din engångskod: ${code}`;

/** Frame 3.3 - contact-form slice. */
export const contactEmail = ({ subject, from, message, page }) => ({
  subject,
  html: shell(`
      <tr><td style="font-size:20px;font-weight:700;padding-bottom:6px">${esc(subject)}</td></tr>
      <tr><td style="font-size:13px;color:#6b6b6b;padding-bottom:20px">
        Från ${esc(from)}${page ? ` &middot; skickat från ${esc(page)}` : ''}</td></tr>
      <tr><td style="font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(message)}</td></tr>`),
  text: `${subject}\nFrån: ${from}\n${page ? `Sida: ${page}\n` : ''}\n${message}`,
});
