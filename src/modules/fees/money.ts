const threeDecimalCurrencies = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
const zeroDecimalCurrencies = new Set(["JPY", "KRW", "VND"]);

export function currencyMinorUnits(currency: string) {
  if (threeDecimalCurrencies.has(currency)) return 3;
  if (zeroDecimalCurrencies.has(currency)) return 0;
  return 2;
}

export function normalizeCurrency(value?: string) {
  const currency = value?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new FeeValidationError("Enter a three-letter currency code.");
  return currency;
}

export function parseMoneyAmount(value: unknown, currency: string) {
  const text = String(value ?? "").trim();
  const decimals = currencyMinorUnits(currency);
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(text)) throw new FeeValidationError(`Enter a valid ${currency} amount.`);
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || 0);
  if (!Number.isSafeInteger(minor) || minor < 1) throw new FeeValidationError("Amount must be greater than zero.");
  return minor;
}

export class FeeValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
