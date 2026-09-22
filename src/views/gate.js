import { esc } from '../lib/html.js';
import { siteLayout } from './layout.js';

/**
 * The password gate.
 *
 * What a locked page renders *instead of* its content - never over it. An
 * overlay drawn on top of the real page would ship the whole page to anyone
 * who opens the source, which is not a lock at all.
 *
 * The site's own header and footer stay, so the visitor can see where they
 * are and leave; only the body is replaced. The card is deliberately styled
 * in literal colours rather than theme tokens, for the same reason the
 * preview bar is: it has to stay legible whatever a site's palette does.
 */
export function passwordGate(page, ctx, { error = '' } = {}) {
  const action = esc(page.permalink);
  return siteLayout({
    title: page.title,
    // Nothing about the page's content leaves the server, the description and
    // share image included - a locked page has no preview.
    noindex: true,
    bodyClass: 'is-landing',
    content: `<div class="gate">
      <form class="gate__card" method="post" action="${action}">
        <h1 class="gate__title">${esc(page.title)}</h1>
        <p class="gate__note">This page is protected. Enter the password to view it.</p>
        ${error ? `<p class="gate__error" role="alert">${esc(error)}</p>` : ''}
        <label class="visually-hidden" for="gate-password">Password</label>
        <input class="gate__input" id="gate-password" type="password" name="password"
               autocomplete="current-password" autocapitalize="off" spellcheck="false"
               required autofocus>
        <button class="gate__button" type="submit">View</button>
      </form>
    </div>`,
    ctx,
  });
}
