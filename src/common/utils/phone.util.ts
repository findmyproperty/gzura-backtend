export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function nationalLast10(phone: string): string {
  return phoneDigits(phone).slice(-10);
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';

  const digits = phoneDigits(trimmed);
  if (digits.length < 10 || digits.length > 15) {
    return '';
  }

  const last10 = digits.slice(-10);
  const isIndianLocal =
    digits.length === 10 ||
    (digits.length === 11 && digits.startsWith('0')) ||
    (digits.length === 12 && digits.startsWith('91')) ||
    (digits.length === 13 && digits.startsWith('910'));

  if (isIndianLocal) {
    return `+91${last10}`;
  }

  if (trimmed.startsWith('+')) {
    if (digits.startsWith('91') && digits.length >= 12) {
      return `+91${last10}`;
    }
    return `+${digits}`;
  }

  return `+${digits}`;
}

export function phoneLookupVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = phoneDigits(trimmed);
  const last10 = nationalLast10(trimmed);
  const normalized = normalizePhone(trimmed);

  return [
    ...new Set(
      [
        trimmed,
        normalized,
        digits,
        last10,
        `0${last10}`,
        `91${last10}`,
        `+91${last10}`,
        `+${digits}`,
        `+0${last10}`,
      ].filter((value) => value.length > 0),
    ),
  ];
}
