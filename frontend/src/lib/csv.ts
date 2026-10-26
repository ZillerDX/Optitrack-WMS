/**
 * CSV that opens correctly in Excel and cannot run a formula:
 * - a UTF-8 byte order mark so non-ASCII names are not garbled
 * - fields with a comma, quote, line break or leading/trailing space are quoted, quotes doubled
 * - a text that starts with = + - @ (or a tab / carriage return) gets a leading apostrophe so a spreadsheet
 *   shows it as text instead of evaluating it (CSV injection)
 * Numbers are written as they are: they never start a formula.
 */

export type CsvCell = string | number | null | undefined;

const BOM = '﻿';

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
