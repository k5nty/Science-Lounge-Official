/* Demo build (GitHub Pages): forms are switched off, the admin is a read-only tour of the real admin pages. */
(function () {
  var BASE = '__BASE__';
  var en = document.documentElement.lang === 'en';
  var isAdmin = location.pathname.indexOf(BASE + '/admin') === 0;
  var MSG = isAdmin ? 'Демо: изменения не сохраняются.' : en ? 'Demo version: sending is switched off.' : 'Демо-версия: отправка отключена.';

  function toast(text) {
    var t = document.getElementById('demo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'demo-toast';
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#111;color:#fff;padding:12px 18px;font:500 14px/1.3 system-ui,sans-serif;border-radius:8px;max-width:calc(100vw - 32px);box-shadow:0 4px 16px rgba(0,0,0,.3)';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.closest) return;
    if (f.closest('form[data-form]')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var out = f.querySelector('.out');
      if (out) {
        out.innerHTML = '<p class="msg"></p>';
        out.firstChild.textContent = MSG;
      }
      return;
    }
    if (!isAdmin) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var action = f.getAttribute('action') || '';
    if (/\/admin\/login$/.test(action)) location.href = BASE + '/admin/';
    else if (/\/admin\/logout$/.test(action)) location.href = BASE + '/admin/login/';
    else toast(MSG);
  }, true);

  if (isAdmin) {
    // uploads go through XMLHttpRequest: refuse anything that is not a plain read
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method) {
      this.demoBlocked = String(method).toUpperCase() !== 'GET';
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (!this.demoBlocked) return send.apply(this, arguments);
      var xhr = this;
      toast(MSG);
      setTimeout(function () { xhr.dispatchEvent(new Event('error')); }, 0);
    };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href$=".csv"]');
      if (a) {
        e.preventDefault();
        toast(MSG);
      }
    }, true);

    var bar = document.createElement('div');
    bar.textContent = 'Демо админки: данные не сохраняются';
    bar.style.cssText = 'background:#111;color:#fff;font:500 13px/1 system-ui,sans-serif;padding:9px 16px;text-align:center';
    document.body.insertBefore(bar, document.body.firstChild);

    if (/\/admin\/login\/?$/.test(location.pathname)) {
      var email = document.getElementById('email');
      var pass = document.getElementById('password');
      if (email) email.value = 'demo@science-lounge.test';
      if (pass) pass.value = 'demo-demo';
      var h = document.querySelector('.a-login .muted');
      if (h) h.textContent = 'Демо: нажмите «Войти»';
    }
  } else {
    var lists = document.querySelectorAll('footer.site ul');
    var last = lists[lists.length - 1];
    if (last) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = BASE + '/admin/login/';
      a.textContent = en ? 'Admin (demo)' : 'Админка (демо)';
      li.appendChild(a);
      last.appendChild(li);
    }
  }
})();
