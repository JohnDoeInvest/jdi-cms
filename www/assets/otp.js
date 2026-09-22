/* Six-box one-time-token input. Pasting the full code fills every box. */
(function () {
  'use strict';
  var group = document.querySelector('[data-otp]');
  var form = document.querySelector('[data-otp-form]');
  if (!group || !form) return;
  var boxes = Array.prototype.slice.call(group.querySelectorAll('.otp__box'));
  var hidden = form.querySelector('[data-otp-value]');

  function sync() {
    hidden.value = boxes.map(function (b) { return b.value; }).join('');
  }

  function fill(text) {
    var digits = String(text).replace(/\D/g, '').slice(0, boxes.length);
    boxes.forEach(function (box) { box.value = ''; });
    distribute(0, digits);
  }

  /** Spread `digits` across the boxes from `start` onward. */
  function distribute(start, digits) {
    var i = start;
    for (var d = 0; d < digits.length && i < boxes.length; d++, i++) boxes[i].value = digits[d];
    sync();
    var next = boxes[Math.min(i, boxes.length - 1)];
    if (next) next.focus();
    if (hidden.value.length === boxes.length) form.requestSubmit();
  }

  boxes.forEach(function (box, index) {
    box.addEventListener('input', function () {
      // A fast typist or an SMS autofill can land several digits in one box;
      // spill the extras into the boxes that follow instead of dropping them.
      var digits = box.value.replace(/\D/g, '');
      box.value = '';
      if (!digits) { sync(); return; }
      distribute(index, digits);
    });
    box.addEventListener('keydown', function (event) {
      if (event.key === 'Backspace' && !box.value && boxes[index - 1]) {
        boxes[index - 1].focus();
        boxes[index - 1].value = '';
        sync();
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft' && boxes[index - 1]) boxes[index - 1].focus();
      if (event.key === 'ArrowRight' && boxes[index + 1]) boxes[index + 1].focus();
    });
    box.addEventListener('paste', function (event) {
      event.preventDefault();
      fill((event.clipboardData || window.clipboardData).getData('text'));
    });
    box.addEventListener('focus', function () { box.select(); });
  });

  form.addEventListener('submit', sync);
})();
