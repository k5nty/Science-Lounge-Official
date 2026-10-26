/* Science Lounge — progressive enhancement. The site is fully readable without this file;
   it adds: remembered "past" toggle, instant search, lightbox, video facade, form submit without reload,
   quote sharing, lazy Telegram widget, consent-gated analytics. */
(function () {
  'use strict';

  var doc = document;
  var script = doc.currentScript;
  var YM_ID = script && script.getAttribute('data-ym');

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }

  /* ---------- analytics (only after consent) ---------- */
  function goal(name) {
    try {
      if (YM_ID && window.ym && store('sl-consent') === 'yes') window.ym(YM_ID, 'reachGoal', name);
      if (window.umami && window.umami.track) window.umami.track(name);
    } catch (e) { /* analytics must never break the page */ }
  }
  function loadMetrika() {
    if (!YM_ID || window.ym) return;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, doc, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(YM_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }
  (function consent() {
    if (!YM_ID) return;
    var banner = $('#cookie');
    var saved = store('sl-consent');
    if (saved === 'yes') loadMetrika();
    else if (!saved && banner) banner.hidden = false;
    if (banner) {
      banner.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cookie]');
        if (!btn) return;
        store('sl-consent', btn.getAttribute('data-cookie'));
        banner.hidden = true;
        if (btn.getAttribute('data-cookie') === 'yes') loadMetrika();
      });
    }
  })();
  doc.addEventListener('click', function (e) {
    var el = e.target.closest('[data-goal]');
    if (el) goal(el.getAttribute('data-goal'));
  });

  /* ---------- schedule: remember the "past" toggle ---------- */
  (function pastBox() {
    var box = $('#past-box');
    if (!box) return;
    var summary = $('summary', box);
    function label() {
      summary.textContent = box.open ? summary.getAttribute('data-open') : summary.getAttribute('data-closed');
    }
    if (store('sl-past-open') === '1') box.open = true;
    label();
    box.addEventListener('toggle', function () {
      store('sl-past-open', box.open ? '1' : '0');
      label();
    });
  })();

  /* ---------- archive: instant search + tag filter ---------- */
  (function archive() {
    var input = $('#arch-q');
    var list = $('#arch-list');
    if (!input || !list) return;
    var none = $('#arch-none');
    var items = $all('[data-slug]', list);
    var activeTag = ((new URLSearchParams(location.search)).get('tag')) || '';
    var index = null;
    var loading = null;

    function loadIndex() {
      if (index) return Promise.resolve(index);
      if (!loading) {
        loading = fetch('/science-lounge-official/search-index.json').then(function (r) { return r.json(); }).then(function (rows) {
          index = {};
          rows.forEach(function (r) { index[r.s] = r.x; });
          return index;
        }).catch(function () { index = {}; return index; });
      }
      return loading;
    }
    function apply() {
      var q = input.value.trim().toLowerCase();
      var words = q.split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (el) {
        var tags = (el.getAttribute('data-tags') || '').split('|');
        var okTag = !activeTag || tags.indexOf(activeTag) !== -1;
        var hay = (index && index[el.getAttribute('data-slug')]) || el.textContent.toLowerCase();
        var okQ = words.every(function (w) { return hay.indexOf(w) !== -1; });
        var show = okTag && okQ;
        el.hidden = !show;
        if (show) shown++;
      });
      if (none) none.hidden = shown > 0;
      $all('#arch-tags .chip').forEach(function (c) {
        if ((c.getAttribute('data-tag') || '') === activeTag) c.setAttribute('aria-current', 'true');
        else c.removeAttribute('aria-current');
      });
    }
    input.addEventListener('focus', loadIndex);
    input.addEventListener('input', function () { loadIndex().then(apply); });
    input.form && input.form.addEventListener('submit', function (e) { e.preventDefault(); });
    $all('#arch-tags .chip').forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.preventDefault();
        activeTag = c.getAttribute('data-tag') || '';
        var url = new URL(location.href);
        if (activeTag) url.searchParams.set('tag', activeTag); else url.searchParams.delete('tag');
        history.replaceState(null, '', url);
        loadIndex().then(apply);
      });
    });
    if (input.value || activeTag) loadIndex().then(apply);
  })();

  /* ---------- auto-submit selects (feedback issue picker) ---------- */
  $all('[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  /* ---------- term tooltips on tap ---------- */
  doc.addEventListener('click', function (e) {
    var term = e.target.closest('.term');
    $all('.term.open').forEach(function (t) { if (t !== term) t.classList.remove('open'); });
    if (term) term.classList.toggle('open');
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $all('.term.open').forEach(function (t) { t.classList.remove('open'); });
  });

  /* ---------- video facade: the player loads only on click ---------- */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('[data-embed]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    var kind = a.getAttribute('data-embed');
    var src = a.getAttribute('data-src');
    var el;
    if (kind === 'video') {
      el = doc.createElement('video');
      el.src = src; el.controls = true; el.autoplay = true; el.setAttribute('playsinline', '');
    } else {
      el = doc.createElement('iframe');
      el.src = src + (src.indexOf('?') === -1 ? '?' : '&') + (src.indexOf('youtube') !== -1 ? 'autoplay=1' : '');
      el.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      el.allowFullscreen = true;
      el.setAttribute('loading', 'lazy');
      el.title = 'Видео';
    }
    var frame = doc.createElement('div');
    frame.className = 'vid-frame';
    frame.appendChild(el);
    a.parentNode.replaceChild(frame, a);
  });

  /* ---------- lightbox ---------- */
  (function lightbox() {
    var links = $all('[data-lightbox]');
    if (!links.length) return;
    var box = doc.createElement('div');
    box.className = 'lb';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = '<div class="lb-stage"><img alt=""></div><div class="lb-cap"></div>' +
      '<button class="lb-close" type="button" aria-label="Закрыть">×</button>' +
      '<button class="lb-prev" type="button" aria-label="Назад">‹</button>' +
      '<button class="lb-next" type="button" aria-label="Вперёд">›</button>';
    doc.body.appendChild(box);
    var img = $('img', box);
    var cap = $('.lb-cap', box);
    var i = 0;
    var list = links;
    var lastFocus = null;

    function show(n) {
      i = (n + list.length) % list.length;
      var a = list[i];
      img.src = a.getAttribute('href');
      var inner = $('img', a);
      img.alt = inner ? inner.alt : '';
      cap.textContent = a.getAttribute('data-caption') || '';
      var multi = list.length > 1;
      $('.lb-prev', box).hidden = !multi;
      $('.lb-next', box).hidden = !multi;
    }
    function open(n, group) {
      list = group;
      lastFocus = doc.activeElement;
      box.hidden = false;
      doc.body.style.overflow = 'hidden';
      show(n);
      $('.lb-close', box).focus();
    }
    function close() {
      box.hidden = true;
      img.removeAttribute('src');
      doc.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        var group = $all('[data-lightbox]', a.closest('section') || doc);
        open(group.indexOf(a), group);
      });
    });
    box.addEventListener('click', function (e) {
      if (e.target.closest('.lb-close') || e.target === box || e.target.classList.contains('lb-stage')) close();
      else if (e.target.closest('.lb-prev')) show(i - 1);
      else if (e.target.closest('.lb-next')) show(i + 1);
    });
    doc.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(i - 1);
      else if (e.key === 'ArrowRight') show(i + 1);
    });
    // swipe on phones
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  /* ---------- share the page / a quote ---------- */
  function share(data) {
    if (navigator.share) {
      navigator.share(data).catch(function () { /* cancelled */ });
      return;
    }
    var text = data.text ? data.text + '\n' + data.url : data.url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Скопировано'); });
    }
  }
  function toast(text) {
    var el = doc.createElement('div');
    el.className = 'share-pop';
    el.textContent = text;
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%)';
    doc.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1800);
  }
  var shareBtn = $('[data-share]');
  if (shareBtn) shareBtn.addEventListener('click', function () { share({ title: doc.title, url: location.href.split('#')[0] }); });
  var printBtn = $('[data-print]');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  (function quoteShare() {
    var notes = $('#notes');
    if (!notes) return;
    var pop = null;
    function hide() { if (pop) { pop.remove(); pop = null; } }
    doc.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hide(); return; }
      var text = sel.toString().trim();
      if (text.length < 12 || text.length > 400) { hide(); return; }
      if (!notes.contains(sel.anchorNode) || !notes.contains(sel.focusNode)) { hide(); return; }
      var rect = sel.getRangeAt(0).getBoundingClientRect();
      hide();
      pop = doc.createElement('button');
      pop.type = 'button';
      pop.className = 'share-pop';
      pop.textContent = 'Поделиться цитатой';
      pop.style.top = (window.scrollY + rect.top - 44) + 'px';
      pop.style.left = Math.max(8, window.scrollX + rect.left) + 'px';
      pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
      pop.addEventListener('click', function () {
        var url = location.href.split('#')[0] + '#:~:text=' + encodeURIComponent(text.split(/\s+/).slice(0, 8).join(' '));
        share({ text: '«' + text + '»', url: url });
        hide();
      });
      doc.body.appendChild(pop);
    });
  })();

  /* ---------- forms: submit without reload, same endpoint works without JS ---------- */
  $all('input[data-consent-trigger]').forEach(function (input) {
    var target = doc.getElementById(input.getAttribute('data-consent-trigger'));
    function sync() { if (target) target.hidden = !input.value.trim(); }
    input.addEventListener('input', sync);
    sync();
  });
  doc.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-form]');
    if (!form || !window.fetch) return;
    e.preventDefault();
    var out = $('.out', form);
    var btn = $('button[type=submit]', form);
    var data = new URLSearchParams(new FormData(form));
    if (btn) btn.disabled = true;
    form.setAttribute('aria-busy', 'true');
    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'fetch' },
      body: data.toString(),
    }).then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Ошибка' }; }); })
      .then(function (res) {
        if (out) out.innerHTML = '<p class="msg' + (res.ok ? '' : ' err') + '"></p>';
        if (out) out.firstChild.textContent = res.message || (res.ok ? 'Спасибо!' : 'Не удалось отправить.');
        if (res.ok) {
          goal(form.getAttribute('data-form'));
          form.reset();
          var consent = $('label.consent[id]', form);
          if (consent) consent.hidden = true;
        }
      })
      .catch(function () {
        if (out) { out.innerHTML = '<p class="msg err"></p>'; out.firstChild.textContent = 'Нет связи. Попробуйте ещё раз.'; }
      })
      .then(function () { if (btn) btn.disabled = false; form.removeAttribute('aria-busy'); });
  });

  /* ---------- Telegram widget: loads when scrolled into view ---------- */
  (function telegram() {
    var holders = $all('[data-tg-post]');
    if (!holders.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var s = doc.createElement('script');
        s.async = true;
        s.src = 'https://telegram.org/js/telegram-widget.js?22';
        s.setAttribute('data-telegram-post', en.target.getAttribute('data-tg-post'));
        s.setAttribute('data-width', '100%');
        en.target.appendChild(s);
      });
    }, { rootMargin: '300px' });
    holders.forEach(function (h) { io.observe(h); });
  })();
})();
