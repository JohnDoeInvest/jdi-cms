import { esc } from '../lib/html.js';
import { config } from '../config.js';
import { asset } from '../lib/assets.js';
import { fontFaceCss } from '../lib/fonts.js';

/** Shared shell for the login and verification screens (Frames 4.1 / 4.2). */
function authShell({ title, body }) {
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Smartare Mat</title>
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
  <a class="auth__logo" href="/">
    <img class="auth__logo-img--for-light" src="/assets/logo-smartaremat.svg" alt="Smartare Mat" width="130" height="46">
    <img class="auth__logo-img--for-dark" src="/assets/logo-smartaremat-light.svg" alt="Smartare Mat" width="130" height="46">
  </a>
  <main class="auth__dialog">${body}</main>
</body>
</html>`;
}

export const loginView = ({ error = '', value = '', notice = '' } = {}) => authShell({
  title: 'Sign in',
  body: `
    <h1>Sign in</h1>
    <form method="post" action="/cms/login" novalidate>
      <div class="field">
        <label for="identifier">Enter your email or mobile number</label>
        <input id="identifier" name="identifier" type="text" inputmode="email" autocomplete="username"
               autofocus placeholder="namn@smartaremat.se" value="${esc(value)}">
      </div>
      ${error ? `<p class="auth__error">${esc(error)}</p>` : ''}
      ${notice ? `<p class="auth__notice">${esc(notice)}</p>` : ''}
      ${notice ? `<p class="auth__notice">${esc(notice)}</p>` : ''}
      <button class="btn btn--primary" type="submit">Continue</button>
    </form>
    <p class="auth__foot">No account? <a href="/kontakt">Contact support</a></p>`,
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
      ${error ? `<p class="auth__error">${esc(error)}</p>` : ''}
      ${devCode ? `<p class="auth__notice">Development mode: the code is <strong>${esc(devCode)}</strong>
        (it will be sent for real once the Brevo key is in place).</p>` : ''}
      <button class="btn btn--primary" type="submit">Sign in</button>
    </form>
    <p class="auth__foot">Did not get a code?
      <a href="/cms/login?resend=${encodeURIComponent(identifier)}">Send again</a></p>
    <script src="${asset('/assets/otp.js')}" defer></script>`,
});
