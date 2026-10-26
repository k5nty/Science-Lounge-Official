/* Theme "press": header shadow once the page scrolls, mobile menu housekeeping, search shortcut. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('has-js');

  var mast = document.getElementById('mast');
  if (mast) {
    var ticking = false;
    var apply = function () {
      ticking = false;
      mast.classList.toggle('is-stuck', window.scrollY > 4);
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  var menu = document.querySelector('.pr-menu');
  if (menu) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) { menu.open = false; var s = menu.querySelector('summary'); if (s) s.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) menu.open = false;
    });
  }

  // header search icon leads to the archive search field
  if (location.hash === '#search') {
    var q = document.getElementById('arch-q');
    if (q) q.focus();
  }
})();
