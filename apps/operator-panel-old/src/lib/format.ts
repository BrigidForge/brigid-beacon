export function formatNumberString(value: string): string {
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

export function formatTokenAmount(value: string, decimals = 18, maxFractionDigits = 4): string {
  try {
    const amount = BigInt(value);
    const negative = amount < 0n;
    const base = negative ? -amount : amount;
    const divisor = 10n ** BigInt(decimals);
    const whole = base / divisor;
    const fraction = base % divisor;

    const wholeLabel = whole.toLocaleString();
    if (fraction === 0n) {
      return negative ? `-${wholeLabel}` : wholeLabel;
    }

    const fractionRaw = fraction.toString().padStart(decimals, '0');
    const trimmed = fractionRaw.replace(/0+$/, '');
    const limited = trimmed.slice(0, Math.max(0, maxFractionDigits));
    const fractionLabel = limited.replace(/0+$/, '');

    if (fractionLabel.length === 0) {
      return negative ? `-${wholeLabel}` : wholeLabel;
    }

    return `${negative ? '-' : ''}${wholeLabel}.${fractionLabel}`;
  } catch {
    return value;
  }
}

export function formatAmountLabel(value: string, unit = 'tokens'): string {
  return `${formatTokenAmount(value)} ${unit}`;
}

export function formatUnixSeconds(value: string): string {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp * 1000).toLocaleString();
}

export function formatIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function shortenAddress(value: string): string {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function shortenHash(value: string): string {
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function formatStateLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatRelativeCountdown(targetSeconds: string): string {
  const target = Number(targetSeconds);
  if (!Number.isFinite(target)) return targetSeconds;
  const now = Math.floor(Date.now() / 1000);
  return formatRelativeDelta(target - now);
}

export function formatRelativeDelta(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds)) return String(deltaSeconds);
  if (deltaSeconds === 0) return 'Now';

  const isPast = deltaSeconds < 0;
  const delta = Math.abs(deltaSeconds);

  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  const seconds = delta % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  if (parts.length === 1 && days === 0 && hours === 0 && minutes < 3) {
    parts.push(`${seconds}s`);
  }

  const text = parts.join(' ');
  return isPast ? `${text} ago` : `in ${text}`;
}

export function formatDurationSeconds(value: string): string {
  const total = Number(value);
  if (!Number.isFinite(total)) return value;
  if (total === 0) return 'No delay';

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} sec`);

  return parts.join(' ');
}
