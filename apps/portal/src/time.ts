// "3 hours ago" (or "3 hr. ago" in tight spots), in the viewer's own language.
const long = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const short = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(iso: string, options: { short?: boolean } = {}): string {
  const rtf = options.short ? short : long;
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** "1 note", "3 notes". */
export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "Nov 5, 2026, 3:42 PM", in the viewer's own language and time zone. */
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
