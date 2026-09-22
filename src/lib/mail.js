import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { esc } from './html.js';
import * as settings from './settings.js';

/**
 * Mail + SMS delivery.
 *
 * With BREVO_API_KEY set, messages go out through Brevo's transactional API.
 * Without it, every message is written to data/outbox/ and echoed to the
 * console, so the full login and contact flow is testable offline.
 */

/** Who a message is from: the configured name, or else the site's own. */
const senderName = () => config.mail.fromName || settings.get('site_name');

/**
 * An SMS sender is at most eleven letters and digits, so the name is cut to
 * fit. Brevo refuses anything else rather than trimming it.
 */
const smsSender = () => senderName().replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'Website';

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
    const file = toOutbox('email', { from: `${senderName()} <${config.mail.fromEmail}>`, to, subject, replyTo: replyTo || '-' }, plain);
    console.log(`  [mail] -> ${to} | ${subject}\n         saved: ${path.relative(config.root, file)}`);
    return { delivered: false, outbox: file };
  }

  await brevo('smtp/email', {
    sender: { name: senderName(), email: config.mail.fromEmail },
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
    const file = toOutbox('sms', { sender: smsSender(), to }, text);
    console.log(`  [sms]  -> ${to}\n         saved: ${path.relative(config.root, file)}`);
    return { delivered: false, outbox: file };
  }
  await brevo('transactionalSMS/sms', {
    sender: smsSender(),
    recipient: to.replace('+', ''),
    content: text,
    type: 'transactional',
  });
  return { delivered: true };
}

/* ---------------------------------------------------------------- templates */

/* Mail clients ignore stylesheets, so these are table layouts with literal
   colours: neutral greys, nothing borrowed from a site's theme. */
const shell = (body) => `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px;background:#f1f2f4;font-family:Helvetica,Arial,sans-serif;color:#17181a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#fff;border-radius:16px;padding:36px 40px">
      ${body}
      <tr><td style="padding-top:28px;border-top:1px solid #dfe1e4;color:#6b7076;font-size:12px;line-height:1.6">
        ${esc(senderName())}<br>
        This message was sent automatically.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

/** Frame 4.3 - one-time code e-mail. */
export const otpEmail = (code) => ({
  subject: 'Your sign-in code',
  html: shell(`
      <tr><td style="font-size:22px;font-weight:700;letter-spacing:-.02em;padding-bottom:20px">Your sign-in code</td></tr>
      <tr><td style="font-size:34px;font-weight:700;letter-spacing:.22em;color:#17181a;
                     background:#f1f2f4;border-radius:12px;padding:18px 24px;text-align:center">${esc(code)}</td></tr>
      <tr><td style="padding-top:24px;font-size:14px;color:#4a4d52;line-height:1.6">
        The code is valid for ${config.otp.ttlMinutes} minutes.<br>
        If you did not try to sign in, you can ignore this message.
      </td></tr>`),
  text: `Your sign-in code: ${code}\nThe code is valid for ${config.otp.ttlMinutes} minutes.`,
});

/** Frame 4.3 - one-time code SMS. */
export const otpSms = (code) => `Your sign-in code: ${code}`;

/** Frame 3.3 - contact-form slice. */
export const contactEmail = ({ subject, from, message, page }) => ({
  subject,
  html: shell(`
      <tr><td style="font-size:20px;font-weight:700;padding-bottom:6px">${esc(subject)}</td></tr>
      <tr><td style="font-size:13px;color:#6b7076;padding-bottom:20px">
        From ${esc(from)}${page ? ` &middot; sent from ${esc(page)}` : ''}</td></tr>
      <tr><td style="font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(message)}</td></tr>`),
  text: `${subject}\nFrom: ${from}\n${page ? `Page: ${page}\n` : ''}\n${message}`,
});
