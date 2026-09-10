const DEFAULT_BUSINESS_HOURS = "평일 10:00~12:00, 14:00~17:00";

export function isOutsideBusinessHours(createdAt: number, configuredHours: string) {
  const local = new Date(createdAt + 9 * 60 * 60 * 1_000);
  const day = local.getUTCDay();
  const text = configuredHours.trim() || DEFAULT_BUSINESS_HOURS;
  const weekdayOnly = /평일/.test(text) && !/매일|주말/.test(text);
  if (weekdayOnly && (day === 0 || day === 6)) return true;
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const ranges = [...text.matchAll(/([01]?\d|2[0-3]):([0-5]\d)\s*[~～\-–—]\s*([01]?\d|2[0-3]):([0-5]\d)/g)]
    .map(match => [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])] as const);
  if (!ranges.length) return true;
  return !ranges.some(([start, end]) => minute >= start && minute < end);
}
