// Turn a pasted video link into something we can embed. Anything unknown stays a plain link.
export function isSafeVideoUrl(raw) {
  const u = String(raw || '').trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(u) || /^\/media\/files\/[\w.-]+\.(mp4|webm)$/i.test(u);
}

export function videoEmbed(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || !isSafeVideoUrl(url)) return { kind: 'none', src: '', href: '' };

  if (/^\/media\/files\/.+\.(mp4|webm)$/i.test(url) || /^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(url)) {
    return { kind: 'video', src: url, href: url, host: 'файл' };
  }

  let u;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'link', src: '', href: url, host: '' };
  }
  const host = u.hostname.replace(/^www\./, '');

  // VK Video: vk.com/video-123_456, vkvideo.ru/video-123_456, vk.com/video_ext.php?oid=..&id=..
  if (/(^|\.)vk\.com$|(^|\.)vkvideo\.ru$/.test(host)) {
    let m = /video(-?\d+)_(\d+)/.exec(u.pathname + u.search);
    if (!m && u.searchParams.get('oid') && u.searchParams.get('id')) m = [null, u.searchParams.get('oid'), u.searchParams.get('id')];
    if (m) {
      const hash = u.searchParams.get('hash');
      const src = `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2${hash ? `&hash=${encodeURIComponent(hash)}` : ''}`;
      return { kind: 'iframe', src, href: url, host: 'VK Видео' };
    }
  }

  if (host === 'rutube.ru') {
    const m = /\/(?:video|play\/embed)\/(?:private\/)?([0-9a-f]{32})/i.exec(u.pathname);
    const key = u.searchParams.get('p');
    if (m) return { kind: 'iframe', src: `https://rutube.ru/play/embed/${m[1]}${key ? `?p=${encodeURIComponent(key)}` : ''}`, href: url, host: 'Rutube' };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
    else id = u.searchParams.get('v') || '';
    if (/^[\w-]{11}$/.test(id)) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}`, href: url, host: 'YouTube' };
  }

  return { kind: 'link', src: '', href: url, host };
}
