import { esc } from '../lib/html.js';
import { config } from '../config.js';
import { asset } from '../lib/assets.js';
import { fontFaceCss } from '../lib/fonts.js';
import { PRODUCT, lockup } from './brand.js';
import { MIN_LENGTH } from '../lib/password.js';

/** Shared shell for the login and verification screens (Frames 4.1 / 4.2). */
function authShell({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${PRODUCT}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<!-- Sign-in has no canvas, so it needs nothing from the site at all - but
     it does need a face, and it is served from here like every other. This
     screen is the one an unauthenticated stranger can reach, so it is the
     last place that should be asking a CDN for anything. -->
<style>${fontFaceCss()}</style>
<script src="${asset('/assets/cms-appearance.js')}"></script>
<link rel="stylesheet" href="${asset('/assets/cms-tokens.css')}">
<link rel="stylesheet" href="${asset('/assets/cms.css')}">
</head>
<body class="auth">
  <a class="auth__logo" href="/" aria-label="${PRODUCT}">${lockup(36)}</a>
  <main class="auth__dialog">${body}</main>
</body>
</html>`;
}

const messages = ({ error = '', notice = '' }) => `
      ${error ? `<p class="auth__error" role="alert">${esc(error)}</p>` : ''}
      ${notice ? `<p class="auth__notice">${esc(notice)}</p>` : ''}`;

/**
 * Frame 4.1 - sign in. What it asks for follows the sign-in method in
 * Settings: a password, a password with a one-time code offered instead, or
 * the code alone.
 */
export const loginView = ({ error = '', value = '', notice = '', method = 'password' } = {}) => authShell({
  title: 'Sign in',
  body: method === 'code' ? `
    <h1>Sign in</h1>
    <form method="post" action="/cms/login" novalidate>
      <input type="hidden" name="via" value="code">
      <div class="field">
        <label for="identifier">Enter your email or mobile number</label>
        <input id="identifier" name="identifier" type="text" inputmode="email" autocomplete="username"
               autofocus placeholder="name@example.com" value="${esc(value)}">
      </div>
      ${messages({ error, notice })}
      <button class="btn btn--primary" type="submit">Continue</button>
    </form>` : `
    <h1>Sign in</h1>
    <form method="post" action="/cms/login" novalidate>
      <div class="field">
        <label for="identifier">Email</label>
        <input id="identifier" name="identifier" type="text" inputmode="email" autocomplete="username"
               ${value ? '' : 'autofocus '}placeholder="name@example.com" value="${esc(value)}">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password"${value ? ' autofocus' : ''}>
      </div>
      ${messages({ error, notice })}
      <div class="row" style="flex-wrap:wrap">
        <button class="btn btn--primary" type="submit">Sign in</button>
        ${method === 'either' ? `<button class="btn btn--quiet" type="submit" name="via" value="code"
          formnovalidate>Send me a code instead</button>` : ''}
      </div>
    </form>
    <p class="auth__foot">${method === 'either'
      ? 'Forgotten your password? Ask for a one-time code instead, then set a new one under Account.'
      : 'Forgotten your password? An administrator can set a new one under Users.'}</p>`,
});

/**
 * First run: the screen that makes the first admin. It exists only until
 * there is one - after that the route answers with the sign-in screen.
 */
export const setupView = ({ error = '', values = {}, token = '' } = {}) => authShell({
  title: 'Welcome',
  body: `
    <h1>Welcome to ${PRODUCT}</h1>
    <p class="auth__label">Create the first account. It is an administrator, and can invite everyone else.</p>
    <form method="post" action="/cms/setup" novalidate>
      <input type="hidden" name="token" value="${esc(token)}">
      <div class="field">
        <label for="full_name">Your name</label>
        <input id="full_name" name="full_name" type="text" autocomplete="name" autofocus value="${esc(values.full_name || '')}">
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required value="${esc(values.email || '')}">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required
               minlength="${MIN_LENGTH}">
        <span class="field__hint">At least ${MIN_LENGTH} characters.</span>
      </div>
      <div class="field">
        <label for="confirm">Password again</label>
        <input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
      </div>
      ${messages({ error })}
      <button class="btn btn--primary" type="submit">Create account</button>
    </form>`,
});

/** The first-run screen, reached from elsewhere without its token. */
export const setupLockedView = () => authShell({
  title: 'Welcome',
  body: `
    <h1>Almost there</h1>
    <p class="auth__label">This site has no administrator yet. To make one, open the address printed
      when the server started - it ends in <code>/cms/setup?token=…</code> - or open this page on the
      machine the server runs on.</p>`,
});

export const verifyView = ({ identifier, error = '', notice = '', devCode = '' } = {}) => authShell({
  title: 'Verification',
  body: `
    <h1>Verification</h1>
    <form method="post" action="/cms/verify" novalidate data-otp-form>
      <input type="hidden" name="identifier" value="${esc(identifier)}">
      <p class="auth__label">Enter the one-time code we sent to <strong>${esc(identifier)}</strong></p>
      <div class="otp" data-otp>
        ${Array.from({ length: config.otp.length }, (_, i) => `
          <input class="otp__box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1"
                 name="d${i}" aria-label="Digit ${i + 1}"${i === 0 ? ' autofocus' : ''}>`).join('')}
      </div>
      <input type="hidden" name="code" data-otp-value>
      ${messages({ error, notice })}
      ${devCode ? `<p class="auth__notice">Development mode: the code is <strong>${esc(devCode)}</strong>
        (it will be sent for real once BREVO_API_KEY is set).</p>` : ''}
      <button class="btn btn--primary" type="submit">Sign in</button>
    </form>
    <p class="auth__foot">Did not get a code?
      <a href="/cms/login?resend=${encodeURIComponent(identifier)}">Send again</a></p>
    <script src="${asset('/assets/otp.js')}" defer></script>`,
});
