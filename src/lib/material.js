// Material on the lecture topic: a long popular-science retelling written in a small Markdown subset.
//   ## heading, ### subheading, - list, 1. list, ``` code ```, --- rule
//   **bold**, *italic*, `code`; a paragraph that starts with [Слайд: …] / [Slide: …] is a slide cue
// Files in materialy-lektsiy/ also carry a title, byline and closing note around the body;
// materialBody() keeps only the part between the first and the last `---` line.
import { esc } from './markup.js';

function inline(src) {
  return esc(src)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<![\p{L}\p{N}_*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}_*])/gu, '<i>$1</i>');
}

/** Strip the title, byline and closing note of a materialy-lektsiy file, leaving the lecture body. */
export function materialBody(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const first = lines.indexOf('---');
  if (first < 0) return lines.join('\n').trim();
  const body = lines.slice(first + 1);
  while (body.length && (!body[body.length - 1].trim() || body[body.length - 1].startsWith('*'))) body.pop();
  if (body[body.length - 1] === '---') body.pop();
  return body.join('\n').trim();
}

/** Render the material body to HTML. Headings start at h3: the section itself carries the h2. */
export function renderMaterial(md) {
  const out = [];
  const para = [];
  let list = null;
  let code = null;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    if (/^\[(Слайд|Slide)/.test(text)) out.push(`<p class="slide">${inline(text.replace(/^\[|\]$/g, ''))}</p>`);
    else out.push(`<p>${inline(text)}</p>`);
    para.length = 0;
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of String(md ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (code) {
      if (line.startsWith('```')) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      flushPara();
      flushList();
      code = [];
      continue;
    }
    const item = /^- (.*)/.exec(line) || /^\d+\. (.*)/.exec(line);
    if (item) {
      flushPara();
      const tag = line.startsWith('- ') ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push(item[1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    if (line === '---') {
      flushPara();
      out.push('<hr>');
    } else if (line.startsWith('### ')) {
      flushPara();
      out.push(`<h4>${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith('## ')) {
      flushPara();
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else para.push(line.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushPara();
  flushList();
  return out.join('\n');
}
