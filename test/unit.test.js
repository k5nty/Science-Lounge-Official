import test from 'node:test';
import assert from 'node:assert/strict';
import { typo, typoRich } from '../src/lib/typo.js';
import { slugify, issueSlug, translit } from '../src/lib/slug.js';
import { mskToUtcIso, toLocalInput, fromLocalInput, longDate, dateRangeRu } from '../src/lib/dates.js';
import { renderRich, makeTermContext, esc, plainText } from '../src/lib/markup.js';
import { icsEscape, fold, vcalendar, vevent } from '../src/lib/ics.js';
import { toCsv } from '../src/lib/csv.js';
import { videoEmbed } from '../src/lib/video.js';
import { hashPassword, verifyPassword, formToken, checkFormToken } from '../src/lib/security.js';

test('typo: quotes, dashes, nbsp', () => {
  assert.equal(typo('Он сказал "привет" - и ушёл'), 'Он сказал «привет» — и ушёл');
  assert.equal(typo('в 5 км от дома'), 'в 5 км от дома');
  assert.equal(typo('№ 5'), '№ 5');
  assert.equal(typo('А.С. Пушкин'), 'А. С. Пушкин');
  assert.equal(typo('вот...'), 'вот…');
  assert.equal(typo('"вложенные "кавычки" тут"'), '«вложенные „кавычки“ тут»');
});

test('typo is idempotent', () => {
  const src = 'Лекция - это "важно" и в 2026 г. мы проведём 5 лекций... Но что ж, по-моему, да.';
  const once = typo(src);
  assert.equal(typo(once), once);
});

test('typoRich leaves formulas and links alone', () => {
  const src = 'Если $a - b = c$ то [ссылка](https://example.org/a-b?x=1) и "кавычки"';
  const out = typoRich(src);
  assert.ok(out.includes('$a - b = c$'));
  assert.ok(out.includes('(https://example.org/a-b?x=1)'));
  assert.ok(out.includes('«кавычки»'));
});

test('slugs', () => {
  assert.equal(translit('Щука'), 'shchuka');
  assert.equal(slugify('Квантовые точки: что это?'), 'kvantovye-tochki-chto-eto');
  assert.equal(issueSlug(5, 'Квантовые точки'), '05-kvantovye-tochki');
  assert.equal(slugify('   '), '');
});

test('dates use fixed Moscow offset', () => {
  assert.equal(mskToUtcIso('2026-11-12', '17:30'), '2026-11-12T14:30:00Z');
  assert.equal(mskToUtcIso('2026-02-30x', '17:30'), null);
  assert.equal(toLocalInput('2026-11-12T14:30:00Z'), '2026-11-12T17:30');
  assert.equal(fromLocalInput('2026-11-12T17:30'), '2026-11-12T14:30:00Z');
  assert.equal(longDate('2026-11-12T14:30:00Z'), '12 ноября 2026');
  assert.equal(longDate('2026-12-31T22:30:00Z'), '1 января 2027');
  assert.equal(dateRangeRu('2026-05-11T00:00:00Z', '2026-05-13T00:00:00Z'), '11–13 мая 2026');
});

test('rich text: escapes HTML, rejects javascript: links, marks first term once', () => {
  const state = { terms: makeTermContext([{ term: 'Дифракция', def: 'Огибание волной препятствий.' }]), math: false };
  const html = renderRich('<script>alert(1)</script> **жирный** [x](javascript:alert(1)) [ok](https://a.b) дифракция и снова дифракция', state);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>жирный</strong>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="https://a.b"'));
  assert.equal((html.match(/class="term"/g) || []).length, 1);
});

test('rich text: formulas via KaTeX', () => {
  const state = { terms: [], math: false };
  const html = renderRich('Энергия $E=mc^2$.', state);
  assert.ok(html.includes('katex'));
  assert.equal(state.math, true);
  assert.equal(plainText('Энергия $E=mc^2$ и **важно**'), 'Энергия E=mc^2 и важно');
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('ics: escaping, folding, structure', () => {
  assert.equal(icsEscape('a,b;c\nd'), String.raw`a\,b\;c\nd`);
  const long = `DESCRIPTION:${'я'.repeat(80)}`;
  const folded = fold(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  const ev = vevent({ uid: 'x@y', startMs: Date.UTC(2026, 10, 12, 14, 30), durationMin: 90, summary: 'Тест', updatedMs: 0 });
  const cal = vcalendar([ev], { name: 'Cal' });
  assert.ok(cal.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(cal.includes('DTSTART:20261112T143000Z'));
  assert.ok(cal.includes('DTEND:20261112T160000Z'));
  assert.ok(cal.endsWith('END:VCALENDAR\r\n'));
});

test('csv: BOM, quoting, formula guard', () => {
  const csv = toCsv([{ a: 'x"y', b: '=HYPERLINK("evil")' }], [{ title: 'A', key: 'a' }, { title: 'B', key: 'b' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"x""y"'));
  assert.ok(csv.includes('"\'=HYPERLINK'));
});

test('video links become embeds', () => {
  assert.deepEqual(videoEmbed('https://vkvideo.ru/video-12_34').kind, 'iframe');
  assert.ok(videoEmbed('https://vk.com/video-12_34').src.includes('oid=-12&id=34'));
  assert.ok(videoEmbed('https://rutube.ru/video/0123456789abcdef0123456789abcdef/').src.includes('/play/embed/'));
  assert.ok(videoEmbed('https://youtu.be/dQw4w9WgXcQ').src.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  assert.equal(videoEmbed('/media/files/abc.mp4').kind, 'video');
  assert.equal(videoEmbed('https://example.org/page').kind, 'link');
  assert.equal(videoEmbed('').kind, 'none');
});

test('passwords and form tokens', async () => {
  const h = await hashPassword('correct horse battery');
  assert.ok(await verifyPassword('correct horse battery', h));
  assert.ok(!(await verifyPassword('wrong', h)));
  const t = formToken('s', Date.now() - 5000);
  assert.ok(checkFormToken('s', t));
  assert.ok(!checkFormToken('other', t));
  assert.ok(!checkFormToken('s', formToken('s', Date.now())), 'too fresh');
  assert.ok(!checkFormToken('s', ''));
});

test('mskToUtcIso rejects impossible dates and times', () => {
  assert.equal(mskToUtcIso('2026-02-31', '17:30'), null);
  assert.equal(mskToUtcIso('2026-13-01', '17:30'), null);
  assert.equal(mskToUtcIso('2026-11-12', '25:99'), null);
  assert.equal(mskToUtcIso('2026-11-12', '24:00'), null);
  assert.equal(mskToUtcIso('2024-02-29', '00:00'), '2024-02-28T21:00:00Z');
});

test('video: unsafe schemes are not embeddable', async () => {
  const { isSafeVideoUrl } = await import('../src/lib/video.js');
  assert.equal(isSafeVideoUrl('javascript:alert(1)'), false);
  assert.equal(isSafeVideoUrl('javascript://vk.com/video-1_2%0Aalert(1)'), false);
  assert.equal(isSafeVideoUrl('data:text/html,x'), false);
  assert.equal(isSafeVideoUrl('https://vkvideo.ru/video-1_2'), true);
  assert.equal(videoEmbed('javascript:alert(1)').kind, 'none');
});

test('news feeds: RSS with CDATA and escaped HTML, Atom, junk summaries, long summaries', async () => {
  const { parseFeed, parseSources, shorten } = await import('../src/lib/news-feed.js');
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Фотон &amp; атом]]></title><link>https://example.org/a?utm_source=x</link><pubDate>Thu, 22 Oct 2026 14:56:00 +0300</pubDate>
      <description>&lt;p&gt;Физики &lt;b&gt;впервые&lt;/b&gt; увидели &amp;laquo;кванты&amp;raquo;.&lt;/p&gt;</description></item>
    <item><title>Same as summary</title><link>https://example.org/b</link><pubDate>22 Oct 2026 08:02:00 +0300</pubDate><description>Same as summary</description></item>
    <item><title>APOD: 2026 October 22 – The Green Star</title><link>https://example.org/c</link><pubDate>Thu, 22 Oct 2026 08:06:14 EDT</pubDate></item>
    <item><title>No date</title><link>https://example.org/d</link></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Thu, 22 Oct 2026 08:06:14 EDT</pubDate></item>
    <item><title>Footer</title><link>https://example.org/e</link><pubDate>Thu, 22 Oct 2026 08:06:14 EDT</pubDate>
      <description><![CDATA[<p>The lasers got stronger [&#8230;]</p><p>The post <a href="https://x">Footer</a> appeared first on Nobel.</p>]]></description></item>
  </channel></rss>`;
  const items = parseFeed(rss);
  assert.deepEqual(items.map((i) => i.title), ['Фотон & атом', 'Same as summary', 'Footer']);
  assert.equal(items[0].summary, 'Физики впервые увидели «кванты».');
  assert.equal(items[0].date.toISOString(), '2026-10-22T11:56:00.000Z');
  assert.equal(items[1].summary, '', 'summary that repeats the title is dropped');
  assert.equal(items[2].summary, 'The lasers got stronger…');

  const atom = `<feed><entry><title>Atom item</title><link href="https://example.org/atom"/><updated>2026-10-21T10:00:00Z</updated><summary>Short.</summary></entry></feed>`;
  assert.deepEqual(parseFeed(atom).map((i) => [i.title, i.link, i.summary]), [['Atom item', 'https://example.org/atom', 'Short.']]);

  const long = 'Первое предложение достаточно длинное, чтобы пройти порог в сто знаков и остаться целиком, ещё немного слов. ' + 'Второе '.repeat(60);
  assert.equal(shorten(long), 'Первое предложение достаточно длинное, чтобы пройти порог в сто знаков и остаться целиком, ещё немного слов.');
  assert.ok(shorten('слово '.repeat(100)).endsWith('…') && shorten('слово '.repeat(100)).length <= 261);

  const src = parseSources('ru|Элементы|https://elementy.ru/rss/news\n# en|Off|https://off.example/rss\nen|Plain http|http://example.org/rss\nde|Wrong lang|https://example.org/rss\nen|Local|https://localhost/rss\nen|IP|https://10.0.0.5/rss\nru||https://example.org/x\nen|Ok|https://phys.org/rss-feed/');
  assert.deepEqual(src.map((s) => s.name), ['Элементы', 'Ok']);
});
