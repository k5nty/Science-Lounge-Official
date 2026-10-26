/* Theme "events": card stagger (only with JS), mobile menu closes on Escape / outside tap / wide screen. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('has-js');

  var items = document.querySelectorAll('.ev, .ev-row, .lc, .card');
  for (var i = 0; i < items.length; i++) items[i].style.setProperty('--i', String(Math.min(i, 5)));

  var menu = document.querySelector('.m-menu');
  if (!menu) return;
  function close() { menu.removeAttribute('open'); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.open) { close(); var s = menu.querySelector('summary'); if (s) s.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (menu.open && !menu.contains(e.target)) close();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(min-width: 1101px)');
    var onChange = function (e) { if (e.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
})();
