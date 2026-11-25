export const FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "select",
  "date",
  "textarea",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  default: string;
  options: string[];
  origin: "declared" | "inferred";
}

export function initialValues(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.default]));
}

export function hasInvalidInputs(fields: FormField[], values: Record<string, string>): boolean {
  return fields.some((field) => {
    const value = values[field.name] ?? "";
    if (field.type === "boolean") return value !== "true" && value !== "false";
    if (field.type === "number") return value.trim() === "" || !Number.isFinite(Number(value));
    if (field.type !== "date") return false;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return true;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    );
  });
}
