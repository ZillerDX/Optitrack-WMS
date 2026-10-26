/** Substring match on every word typed, so "rec mov" finds "Record a movement". */
export function matches(title: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = title.toLowerCase();
  return words.every((w) => text.includes(w));
}
