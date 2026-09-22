/* ===================================================================
   Slice CMS - appearance.

   Light, dark, or whatever the system is set to. Loaded in the head and
   not deferred, so the root knows which before the first paint and a dark
   screen never flashes white on its way in. An inline script would be
   shorter, and the Content-Security-Policy refuses one (script-src 'self'),
   which is right - so it is a file, and a small one.

   The choice is kept in this browser, like the pinned rail: it is how one
   person likes to look at the screen, not something the site stores.
   =================================================================== */
(function () {
  'use strict';

  var KEY = 'sm_appearance';
  var root = document.documentElement;
  var system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch (e) {
      return 'system';
    }
  }

  var choice = stored();

  /* Two attributes: the mode the stylesheet draws in, and the choice behind
     it, which the rail's switch shows. "System" is resolved here rather
     than in a media query, so the stylesheet has one dark set, not two. */
  function apply() {
    var mode = choice === 'system' ? (system && system.matches ? 'dark' : 'light') : choice;
    root.setAttribute('data-appearance', mode);
    root.setAttribute('data-appearance-choice', choice);
    try {
      document.dispatchEvent(new CustomEvent('cms:appearance', { detail: { choice: choice, mode: mode } }));
    } catch (e) { /* an old engine without CustomEvent still gets the right colours */ }
  }

  apply();

  // Following the system means following it when it changes, too.
  if (system) {
    var follow = function () { if (choice === 'system') apply(); };
    if (system.addEventListener) system.addEventListener('change', follow);
    else if (system.addListener) system.addListener(follow);
  }

  // Changed in another tab: this one follows, rather than disagreeing.
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY) return;
    choice = stored();
    apply();
  });

  window.CMSAppearance = {
    get: function () { return choice; },
    set: function (next) {
      choice = next === 'light' || next === 'dark' ? next : 'system';
      try {
        if (choice === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, choice);
      } catch (e) { /* storage refused: it still changes, for this page */ }
      apply();
      return choice;
    },
  };
})();
