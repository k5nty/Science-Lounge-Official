/* Science Lounge admin: repeaters, uploads, counters, guards. No dependencies. */
(function () {
  'use strict';
  var doc = document;
  var CSRF = (doc.querySelector('meta[name=csrf]') || {}).content || '';

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  var dirty = false;

  /* ---------- unsaved changes ---------- */
  $all('form[data-guard]').forEach(function (form) {
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('change', function () { dirty = true; });
    form.addEventListener('submit', function () { dirty = false; });
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- confirm ---------- */
  doc.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });
  $all('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  /* ---------- character counters ---------- */
  function attachCounter(el) {
    if (el.__counter) return;
    var max = parseInt(el.getAttribute('data-count'), 10);
    if (!max) return;
    var c = doc.createElement('div');
    c.className = 'a-counter';
    el.parentNode.insertBefore(c, el.nextSibling);
    el.__counter = c;
    function upd() {
      var n = el.value.length;
      c.textContent = n + ' / ' + max;
      c.classList.toggle('over', n > max);
    }
    el.addEventListener('input', upd);
    upd();
  }
  $all('[data-count]').forEach(attachCounter);

  /* ---------- repeaters ---------- */
  function reindex(rep) {
    var name = rep.getAttribute('data-repeater');
    $all('[data-item]', $('[data-list]', rep)).forEach(function (item, i) {
      $all('input, textarea, select', item).forEach(function (f) {
        if (f.name) f.name = f.name.replace(new RegExp('^' + name + '\\[(?:\\d+|__i__)\\]'), name + '[' + i + ']');
      });
      var n = $('[data-n]', item);
      if (n) n.textContent = i + 1;
    });
  }
  $all('[data-repeater]').forEach(function (rep) {
    var list = $('[data-list]', rep);
    var tpl = $('template', rep);
    rep.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add]')) {
        var holder = doc.createElement('div');
        holder.innerHTML = tpl.innerHTML.trim();
        var node = holder.firstElementChild;
        list.appendChild(node);
        $all('[data-count]', node).forEach(attachCounter);
        reindex(rep);
        var first = $('input, textarea', node);
        if (first) first.focus();
        dirty = true;
        return;
      }
      var item = t.closest('[data-item]');
      if (!item) return;
      if (t.closest('[data-remove]')) { item.remove(); reindex(rep); dirty = true; }
      else if (t.closest('[data-up]') && item.previousElementSibling) { list.insertBefore(item, item.previousElementSibling); reindex(rep); dirty = true; }
      else if (t.closest('[data-down]') && item.nextElementSibling) { list.insertBefore(item.nextElementSibling, item); reindex(rep); dirty = true; }
    });
    reindex(rep);
  });

  /* ---------- uploads ---------- */
  function upload(file, purpose, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', purpose);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/admin/media');
      xhr.setRequestHeader('X-CSRF-Token', CSRF);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var res = {};
        try { res = JSON.parse(xhr.responseText); } catch (err) { /* keep {} */ }
        if (xhr.status >= 200 && xhr.status < 300 && res.ok) resolve(res.media);
        else reject(new Error(res.message || 'Не удалось загрузить файл (' + xhr.status + ')'));
      };
      xhr.onerror = function () { reject(new Error('Нет связи с сервером.')); };
      xhr.send(fd);
    });
  }

  // single-file pickers
  $all('[data-picker]').forEach(function (p) {
    var input = $('input[type=hidden]', p);
    var file = $('input[type=file]', p);
    var thumb = $('[data-thumb]', p);
    var status = $('[data-status]', p);
    var clear = $('[data-clear]', p);
    file.addEventListener('change', function () {
      if (!file.files[0]) return;
      status.className = 'a-status';
      status.textContent = 'Загружаю…';
      upload(file.files[0], p.getAttribute('data-purpose'), function (f) { status.textContent = 'Загружаю… ' + Math.round(f * 100) + '%'; })
        .then(function (m) {
          input.value = m.id;
          thumb.innerHTML = m.thumb ? '<img src="' + m.thumb + '" alt="">' : '<span class="mono"></span>';
          if (!m.thumb) thumb.firstChild.textContent = m.orig_name || 'файл';
          clear.hidden = false;
          status.textContent = 'Готово';
          dirty = true;
        })
        .catch(function (err) { status.className = 'a-status err'; status.textContent = err.message; })
        .then(function () { file.value = ''; });
    });
    clear.addEventListener('click', function () {
      input.value = '';
      thumb.innerHTML = '';
      clear.hidden = true;
      status.textContent = '';
      dirty = true;
    });
  });

  // video file into a URL input
  $all('[data-video-upload]').forEach(function (file) {
    file.addEventListener('change', function () {
      if (!file.files[0]) return;
      var target = doc.getElementById(file.getAttribute('data-video-upload'));
      var label = file.parentNode;
      var old = label.firstChild.textContent;
      label.firstChild.textContent = 'Загружаю…';
      upload(file.files[0], 'video', function (f) { label.firstChild.textContent = 'Загружаю… ' + Math.round(f * 100) + '%'; })
        .then(function (m) { target.value = m.url; dirty = true; label.firstChild.textContent = 'Загружено'; })
        .catch(function (err) { window.alert(err.message); label.firstChild.textContent = old; })
        .then(function () { file.value = ''; });
    });
  });

  // photo galleries: batch upload, order, remove, bulk consent
  $all('[data-photos]').forEach(function (box) {
    var list = $('[data-list]', box);
    var tpl = $('template', box).innerHTML;
    var status = $('[data-status]', box);
    var input = $('input[type=file]', box);
    var purpose = box.getAttribute('data-purpose') || 'photo';

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files);
      if (!files.length) return;
      var done = 0;
      var failed = [];
      status.className = 'a-status';
      function next() {
        if (!files.length) {
          status.textContent = 'Загружено: ' + done + (failed.length ? ', с ошибкой: ' + failed.length : '');
          if (failed.length) { status.className = 'a-status err'; status.textContent += ' (' + failed.join('; ') + ')'; }
          input.value = '';
          return;
        }
        var f = files.shift();
        status.textContent = 'Загружаю ' + (done + 1) + ' из ' + (done + files.length + 1) + '…';
        upload(f, purpose, null).then(function (m) {
          var html = tpl.replace(/__ID__/g, m.id).replace(/__THUMB__/g, m.thumb);
          var holder = doc.createElement('div');
          holder.innerHTML = html.trim();
          var li = holder.firstElementChild;
          var cons = $('select[data-consent]', li);
          var bulk = $('[data-bulk-consent]', box);
          if (cons && bulk && bulk.value) cons.value = bulk.value;
          list.appendChild(li);
          done++;
          dirty = true;
        }).catch(function (err) { failed.push(f.name + ': ' + err.message); }).then(next);
      }
      next();
    });

    box.addEventListener('click', function (e) {
      var li = e.target.closest('[data-photo]');
      if (!li) return;
      if (e.target.closest('[data-remove]')) { li.remove(); dirty = true; }
      else if (e.target.closest('[data-up]') && li.previousElementSibling) { list.insertBefore(li, li.previousElementSibling); dirty = true; }
      else if (e.target.closest('[data-down]') && li.nextElementSibling) { list.insertBefore(li.nextElementSibling, li); dirty = true; }
    });

    var bulk = $('[data-bulk-consent]', box);
    if (bulk) bulk.addEventListener('change', function () {
      if (!bulk.value) return;
      $all('select[data-consent]', box).forEach(function (s) { s.value = bulk.value; });
      dirty = true;
    });
  });
})();
