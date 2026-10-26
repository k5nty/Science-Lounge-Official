// iCalendar (RFC 5545) generation. Times are written in UTC.
import { config } from '../config.js';

const CRLF = '\r\n';

export function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per RFC 5545, never splitting a UTF-8 sequence. */
export function fold(line) {
  const buf = Buffer.from(line, 'utf8');
  if (buf.length <= 75) return line;
  const parts = [];
  let start = 0;
  let limit = 75;
  while (start < buf.length) {
    let end = Math.min(start + limit, buf.length);
    // do not cut in the middle of a multi-byte char
    while (end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
    parts.push(buf.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines start with one space
  }
  return parts.join(`${CRLF} `);
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function vevent({ uid, startMs, durationMin, summary, description, location, url, updatedMs, cancelled }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(updatedMs || Date.now())}`,
    `DTSTART:${stamp(startMs)}`,
    `DTEND:${stamp(startMs + durationMin * 60e3)}`,
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push(`SEQUENCE:${Math.floor((updatedMs || 0) / 1000)}`);
  lines.push(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT');
  return lines;
}

export function vcalendar(eventLines, { name, description } = {}) {
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Science Lounge//Letovo//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (name) {
    head.push(`X-WR-CALNAME:${icsEscape(name)}`, `NAME:${icsEscape(name)}`);
  }
  if (description) head.push(`X-WR-CALDESC:${icsEscape(description)}`);
  head.push('X-WR-TIMEZONE:Europe/Moscow', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H');
  const all = [...head, ...eventLines.flat(), 'END:VCALENDAR'];
  return all.map(fold).join(CRLF) + CRLF;
}

export function issueEvent(issue, lecturerNames, { numberLabel }) {
  const host = new URL(config.siteUrl).host;
  const startMs = Date.parse(issue.start_at);
  const url = `${config.siteUrl}/vypusk/${issue.slug}`;
  const summary = `Science Lounge ${numberLabel}: ${issue.title_ru}`;
  const desc = [lecturerNames.join(', '), issue.announce_ru || issue.thought_ru, url].filter(Boolean).join('\n\n');
  return vevent({
    uid: `issue-${issue.id}@${host}`,
    startMs,
    durationMin: config.lectureMinutes,
    summary,
    description: desc,
    location: issue.place_ru,
    url,
    updatedMs: Date.parse(issue.updated_at),
    cancelled: issue.status_flag === 'cancelled',
  });
}
