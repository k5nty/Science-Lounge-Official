/* Theme "campus": the phone menu is a <details>, this only tidies it (Escape, click outside, back to desktop width). */
(function () {
  'use strict';
  var doc = document;
  doc.documentElement.classList.add('has-js');
  var menu = doc.querySelector('.cm-menu');
  if (!menu) return;
  function close(focusBack) {
    if (!menu.open) return;
    menu.open = false;
    if (focusBack) { var s = menu.querySelector('summary'); if (s) s.focus(); }
  }
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(true); });
  doc.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) close(false); });
  if (window.matchMedia) {
    var mq = window.matchMedia('(min-width: 961px)');
    var onChange = function (e) { if (e.matches) close(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
})();
