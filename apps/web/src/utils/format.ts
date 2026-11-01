const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  return timeFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFormatter.format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function pad2(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0');
}

export function formatMs(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(digits)} ms`;
}
