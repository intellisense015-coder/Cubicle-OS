export function sanitizeNumericInput(value: unknown, integer = false) {
  const raw = String(value ?? "");
  const digits = raw.replace(/[^0-9.]/g, "");
  if (integer) return digits.split(".")[0];
  const [whole, ...fraction] = digits.split(".");
  return fraction.length ? `${whole}.${fraction.join("")}` : whole;
}

export function numericString(value: unknown, fallback = "") {
  const cleaned = sanitizeNumericInput(value);
  return cleaned || fallback;
}

export function numericField(registerField: any, name: string, integer = false) {
  const field = registerField(name);
  return {
    ...field,
    inputMode: integer ? "numeric" : "decimal",
    onChange: (event: any) => {
      event.target.value = sanitizeNumericInput(event.target.value, integer);
      field.onChange(event);
    },
  };
}
