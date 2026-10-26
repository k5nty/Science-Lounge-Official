// Minimal, safe rich-text for lecture notes.
//   blank line  -> new paragraph
//   **bold**, *italic*, [text](https://link)
//   $formula$ and $$display formula$$ via KaTeX (server side)
//   terms: first occurrence in the notes gets a hover/tap definition
import katex from 'katex';

const SAFE_URL = /^(https?:\/\/|mailto:|tg:|\/(?!\/))/i;

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function stemPattern(word) {
  const w = word.trim();
  const base = w.endsWith('*') ? w.slice(0, -1) : null;
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (base !== null) return `${escRe(base)}\\p{L}*`;
  // Auto stem: drop the inflection ending of longer words.
  const chars = [...w];
  if (chars.length >= 7) return `${escRe(chars.slice(0, -2).join(''))}\\p{L}{0,3}`;
  if (chars.length >= 5) return `${escRe(chars.slice(0, -1).join(''))}\\p{L}{0,2}`;
  return escRe(w);
}

/** Build one RegExp for a term: explicit forms from `match` or auto stems of the term itself. */
export function termRegex(term) {
  const forms = String(term.match || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const patterns = [];
  if (forms.length) {
    for (const f of forms) patterns.push(f.split(/\s+/).map(stemPattern).join('\\s+'));
  } else {
    patterns.push(
      String(term.term || '')
        .trim()
        .split(/\s+/)
        .map(stemPattern)
        .join('\\s+'),
    );
  }
  if (!patterns[0]) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode, output: 'htmlAndMathml', strict: 'ignore' });
  } catch {
    return esc(tex);
  }
}

/**
 * Render one paragraph source to HTML.
 * `ctx` = { terms: [{term, def, re, id, used}], math: boolean }
 */
function inline(src, ctx) {
  const mathSlots = [];
  // Pull formulas out first: their content must not be touched by other rules.
  let s = src
    .replace(/\$\$([^$]+?)\$\$/g, (_, tex) => {
      mathSlots.push(renderMath(tex.trim(), true));
      ctx.math = true;
      return `\u0000${mathSlots.length - 1}\u0000`;
    })
    .replace(/(?<![\\$\d])\$([^$\n]+?)\$(?!\d)/g, (_, tex) => {
      mathSlots.push(renderMath(tex.trim(), false));
      ctx.math = true;
      return `\u0000${mathSlots.length - 1}\u0000`;
    });

  s = esc(s);

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const raw = url.replace(/&amp;/g, '&');
    if (!SAFE_URL.test(raw)) return text;
    const ext = /^https?:/i.test(raw);
    return `<a href="${esc(raw)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\p{L}\p{N}*])\*([^*\n]+?)\*(?![\p{L}\p{N}*])/gu, '<em>$1</em>');
  s = s.replace(/\n/g, '<br>');

  // Terms: only inside plain text nodes, outside links.
  if (ctx.terms && ctx.terms.length) {
    let inLink = 0;
    s = s
      .split(/(<[^>]+>)/)
      .map((part) => {
        if (part.startsWith('<')) {
          if (/^<a[\s>]/i.test(part)) inLink++;
          else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
          return part;
        }
        if (inLink) return part;
        return part
          .split(/(\u0000\d+\u0000)/)
          .map((seg) => (seg.startsWith('\u0000') ? seg : wrapTerms(seg, ctx)))
          .join('');
      })
      .join('');
  }

  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => mathSlots[+i]);
  return s;
}

function wrapTerms(text, ctx) {
  let best = null;
  for (const t of ctx.terms) {
    if (t.used || !t.re) continue;
    const m = t.re.exec(text);
    if (m && (!best || m.index < best.m.index)) best = { t, m };
  }
  if (!best) return text;
  const { t, m } = best;
  t.used = true;
  const mark =
    `<span class="term" tabindex="0" aria-describedby="${t.id}">${m[0]}` +
    `<span class="term-def" id="${t.id}" role="tooltip"><b>${esc(t.term)}.</b> ${esc(t.def)}</span></span>`;
  return wrapTerms(text.slice(0, m.index), ctx) + mark + wrapTerms(text.slice(m.index + m[0].length), ctx);
}

export function makeTermContext(terms = [], idPrefix = 't') {
  return terms
    .filter((t) => t && t.term && t.def)
    .map((t, i) => ({ term: t.term, def: t.def, re: termRegex(t), id: `${idPrefix}-${i + 1}`, used: false }));
}

/** Render rich text. `state` is shared across blocks of one issue so each term is marked once. */
export function renderRich(src, state = { terms: [], math: false }) {
  const paragraphs = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${inline(p, state)}</p>`).join('\n');
}

/** Plain text of rich markup (search index, reading time, meta). */
export function plainText(src) {
  return String(src ?? '')
    .replace(/\$\$?([^$]+?)\$\$?/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*?([^*]+?)\*\*?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max = 160) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}
