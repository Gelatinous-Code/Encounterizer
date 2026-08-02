export function safeReturnTo(value: string | null | undefined, fallback = '/campaigns'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const parsed = new URL(value, 'https://encounterizer.invalid');
    return parsed.origin === 'https://encounterizer.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
