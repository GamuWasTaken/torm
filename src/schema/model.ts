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
