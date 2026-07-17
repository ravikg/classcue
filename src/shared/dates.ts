const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = dateFormatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateFormatterCache.set(timeZone, value);
  }
  return value;
}

export function localDateInZone(date: Date, timeZone: string): string {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay();
}

export function zonedLocalToUtc(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetAsUtc;

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter(timeZone).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    guess -= renderedAsUtc - targetAsUtc;
  }

  return new Date(guess);
}
