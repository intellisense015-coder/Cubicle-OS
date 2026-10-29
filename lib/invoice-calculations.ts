/**
 * Invoice totals are calculated in integer minor units (PKR paisa) so that
 * percentages and decimal amounts do not accumulate JavaScript float error.
 *
 * Business rules:
 * - Sales tax is included in the quoted total. For example, a subtotal of
 *   PKR 85,000 at 15% inclusive Sales Tax produces PKR 15,000 tax and a
 *   PKR 100,000 total.
 * - WHT is withheld from the subtotal (not from sales tax).
 * - A disabled tax, a zero rate, or a zero calculated amount is treated as
 *   "Not Included" by the document renderers.
 */

export type InvoiceTaxInput = {
  subtotal: unknown;
  salesTaxEnabled?: boolean;
  salesTaxRate?: unknown;
  whtEnabled?: boolean;
  whtRate?: unknown;
};

export type InvoiceTotals = {
  subtotal: number;
  salesTaxRate: number;
  salesTaxAmount: number;
  whtRate: number;
  whtAmount: number;
  total: number;
};

export function parseAmount(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMinorUnits(value: number) {
  return Math.round(roundMoney(value) * 100);
}

function fromMinorUnits(value: number) {
  return value / 100;
}

function percentageAmount(baseMinorUnits: number, rate: number) {
  // Round the percentage result once, at the financial boundary.
  return Math.round((baseMinorUnits * rate) / 100);
}

export function calculateInvoiceTotals(input: InvoiceTaxInput): InvoiceTotals {
  const subtotalMinorUnits = toMinorUnits(parseAmount(input.subtotal));
  const salesTaxRate = roundMoney(parseAmount(input.salesTaxRate));
  const whtRate = roundMoney(parseAmount(input.whtRate));
  const salesTaxAmountMinorUnits = input.salesTaxEnabled && salesTaxRate > 0 && salesTaxRate < 100
    ? Math.round((subtotalMinorUnits * salesTaxRate) / (100 - salesTaxRate))
    : 0;
  const whtAmountMinorUnits = input.whtEnabled && whtRate > 0
    ? percentageAmount(subtotalMinorUnits, whtRate)
    : 0;

  return {
    subtotal: fromMinorUnits(subtotalMinorUnits),
    salesTaxRate,
    salesTaxAmount: fromMinorUnits(salesTaxAmountMinorUnits),
    whtRate,
    whtAmount: fromMinorUnits(whtAmountMinorUnits),
    total: fromMinorUnits(Math.max(0, subtotalMinorUnits + salesTaxAmountMinorUnits - whtAmountMinorUnits)),
  };
}

export function isIncludedTax(enabled: unknown, amount: unknown, label?: unknown) {
  const normalizedLabel = String(label || "").trim().toLowerCase().replaceAll("_", " ");
  const explicitlyExcluded = ["not included", "not applicable", "n/a", "none"].includes(normalizedLabel);
  return enabled === true && !explicitlyExcluded && parseAmount(amount) > 0;
}
