// CSV for Excel: UTF-8 BOM, semicolon separator (Russian locale default), formula-injection guard.
export function toCsv(rows, columns) {
  const cell = (value) => {
    let s = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = columns.map((c) => cell(c.title)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}
