/* Public site behaviour. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------ mobile menu */
  var topbar = document.querySelector('[data-topbar]');
  var toggle = document.querySelector('[data-menu-toggle]');

  /* One attribute, which the styles key off and the button reports. Nothing
     here freezes the page any more: the open menu covers the screen by
     itself, and freezing the page is what used to send it off-screen - a
     page that cannot scroll gives a sticky bar nothing to stick to. */
  function setMenuOpen(open) {
    if (!topbar) return;
    topbar.setAttribute('data-open', String(open));
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
  }

  if (topbar && toggle) {
    toggle.addEventListener('click', function () {
      setMenuOpen(topbar.getAttribute('data-open') !== 'true');
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (topbar && topbar.getAttribute('data-open') === 'true') setMenuOpen(false);
  });

  /* ------------------------------------------------------ article feeds
     A feed set to keep going renders its first batch server-side - so the
     page is complete before any script runs, and a crawler sees articles -
     and asks for the rest a batch at a time. The server renders the cards,
     so there is one description of what an article looks like rather than a
     second copy of it here. */
  document.querySelectorAll('[data-feed]').forEach(function (feed) {
    var items = feed.querySelector('[data-feed-items]');
    var control = feed.querySelector('[data-feed-more]');
    if (!items || !control) return;

    var offset = parseInt(feed.dataset.offset, 10) || 0;
    var busy = false;
    var done = false;

    function query() {
      return '/api/feed?path=' + encodeURIComponent(feed.dataset.path || '/')
        + '&block=' + encodeURIComponent(feed.dataset.feed)
        + '&offset=' + offset
        + (feed.dataset.category ? '&category=' + encodeURIComponent(feed.dataset.category) : '');
    }

    /* `done` and `busy` are separate: one request in flight must not start a
       second, and a feed that has reached the end must never ask again -
       an observer fires repeatedly as the page settles. */
    function load() {
      if (busy || done) return;
      busy = true;
      feed.setAttribute('data-loading', 'true');
      fetch(query(), { headers: { Accept: 'application/json' } })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error(res.status)); })
        .then(function (data) {
          if (data.html) items.insertAdjacentHTML('beforeend', data.html);
          offset += data.count || 0;
          if (!data.more || !data.count) finish();
        })
        .catch(function () {
          // Nothing partial is left behind, and the button stays: a failed
          // batch should be retryable, not the end of the list.
          finish(true);
        })
        .then(function () {
          busy = false;
          feed.removeAttribute('data-loading');
          /* An observer reports *changes*, and a batch that does not fill the
             screen leaves the sentinel exactly where it was - still in view,
             so no change, so no second batch and a feed stuck at one page.
             Re-observing asks it afresh, which fires with the current state
             and keeps going until the screen is full or the list runs out. */
          if (!done && observer) {
            observer.unobserve(control);
            observer.observe(control);
          }
        });
    }

    function finish(keepControl) {
      done = !keepControl;
      if (!keepControl) control.remove();
      if (observer) observer.disconnect();
    }

    var observer = null;
    if (feed.dataset.mode === 'scroll' && 'IntersectionObserver' in window) {
      // rootMargin loads the next batch before the sentinel is actually
      // reached, so the list rarely stops under the reader.
      observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) load();
      }, { rootMargin: '400px 0px' });
      observer.observe(control);
    } else {
      // The button is also the fallback wherever the observer is missing.
      control.addEventListener('click', load);
      control.classList.remove('feed-more--auto');
      if (!control.querySelector('button')) {
        control.innerHTML = '<button class="btn" type="button">Show more</button>';
      }
    }
  });

  /* -------------------------------------------------- contact form gate
     Frame 3.3: submit stays dimmed until a subject is chosen, the e-mail
     looks valid and the message has content. Re-checked on the server. */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  document.querySelectorAll('.contact-form').forEach(function (form) {
    var subject = form.querySelector('[name="subject"]');
    var email = form.querySelector('[name="email"]');
    var message = form.querySelector('[name="message"]');
    var submit = form.querySelector('[data-contact-submit]');
    if (!subject || !email || !message || !submit) return;

    function revalidate() {
      var ok = subject.value.trim() !== ''
        && EMAIL.test(email.value.trim())
        && message.value.trim() !== '';
      submit.disabled = !ok;
    }
    ['input', 'change', 'blur'].forEach(function (type) {
      [subject, email, message].forEach(function (field) { field.addEventListener(type, revalidate); });
    });
    revalidate();
  });
})();
