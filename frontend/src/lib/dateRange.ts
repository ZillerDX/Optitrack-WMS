/**
 * A range of calendar days picked in a form ('YYYY-MM-DD', the viewer's own days) as the instants the API
 * wants. The whole of the first day through the last millisecond of the last day, in the viewer's time zone,
 * so a movement at 23:30 local time is on that day whatever the zone (U2).
 */

function parseDay(day: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d ? { y, m, d } : null;
}

/** ISO instant of 00:00:00.000 on that day, local time. */
export function startOfLocalDay(day: string): string | null {
  const p = parseDay(day);
  return p ? new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).toISOString() : null;
}

/** ISO instant of 23:59:59.999 on that day, local time. */
export function endOfLocalDay(day: string): string | null {
  const p = parseDay(day);
  return p ? new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).toISOString() : null;
}
