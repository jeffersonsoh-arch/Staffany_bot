/**
 * Approximate UTC offset (in minutes) of an IANA timezone at a given instant,
 * derived from Intl instead of pulling in a date library.
 */
export function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const part = dtf.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

/** Start/end of the given YYYY-MM-DD calendar day, in the given timezone, expressed as UTC ISO strings. */
export function dayBoundsUtc(dateStr: string, timeZone: string): { start: string; end: string } {
  const midnightUtcGuess = new Date(`${dateStr}T00:00:00.000Z`);
  const offsetMinutes = timezoneOffsetMinutes(timeZone, midnightUtcGuess);
  const startMs = midnightUtcGuess.getTime() - offsetMinutes * 60_000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

/** Parses "today", "tomorrow", or YYYY-MM-DD (in the given timezone) into a YYYY-MM-DD string. */
export function parseDateInput(input: string | undefined, timeZone: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayStr = fmt.format(now); // en-CA gives YYYY-MM-DD

  if (!input || input.toLowerCase() === "today") return todayStr;
  if (input.toLowerCase() === "tomorrow") {
    const [y, m, d] = todayStr.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return next.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  throw new Error(`Couldn't understand date "${input}". Use "today", "tomorrow", or YYYY-MM-DD.`);
}

export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone, hour: "2-digit", minute: "2-digit", hour12: false };
  const start = new Intl.DateTimeFormat("en-GB", opts).format(new Date(startIso));
  const end = new Intl.DateTimeFormat("en-GB", opts).format(new Date(endIso));
  return `${start}–${end}`;
}

export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(iso),
  );
}
