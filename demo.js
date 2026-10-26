/* View-only demo: forms are switched off. */
document.addEventListener('submit', function (e) {
  var f = e.target.closest && e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  var out = f.querySelector('.out');
  if (out) { out.innerHTML = '<p class="msg"></p>'; out.firstChild.textContent = document.documentElement.lang === 'en' ? 'Demo version: sending is switched off.' : 'Демо-версия: отправка отключена.'; }
}, true);
