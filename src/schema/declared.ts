import {
  descendants,
  identifier,
  namedValue,
  stringLiteral,
  sourceSlice,
  type AstNode,
  type ParsedAst,
} from "./ast";
import { FIELD_TYPES, type FieldType, type FormField } from "./model";

function asFieldType(value: unknown): FieldType {
  const text = String(value ?? "text").toLowerCase();
  return FIELD_TYPES.includes(text as FieldType) ? (text as FieldType) : "text";
}

function readOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value.split(",").map((option) => option.trim());
  }
  return [];
}

function readDefault(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeDeclaredFields(value: unknown): FormField[] {
  const items = (Array.isArray(value) ? value.flat(1) : [value]).filter(isRecord);

  return items
    .map((item) => {
      const name = String(item.name ?? "");
      return {
        name,
        label: String(item.label ?? name),
        type: asFieldType(item.type),
        default: readDefault(item.default),
        options: readOptions(item.options),
        origin: "declared" as const,
      };
    })
    .filter((field) => field.name.length > 0);
}

function readDeclaredLiteral(node: AstNode, lines: string[]): unknown {
  const value = stringLiteral(node);
  if (value !== undefined) return value;
  if (node.label === "Marked::Array") {
    return node.children.flatMap((child) => {
      const item = stringLiteral(child);
      return item === undefined ? [] : [item];
    });
  }
  return sourceSlice(node, lines);
}

export function readDeclaredFields(parsed: ParsedAst): FormField[] {
  const { root, lines } = parsed;
  const schema: Record<string, unknown>[] = [];

  for (const node of descendants(root)) {
    if (node.label !== "Marked::LetBinding") continue;
    if (!node.children.some((child) => identifier(child) === "form-schema")) continue;

    const array = node.children.find((child) => child.label === "Marked::Array");
    if (!array) continue;

    for (const dict of array.children) {
      if (dict.label !== "Marked::Dict") continue;
      const record: Record<string, unknown> = {};
      for (const named of dict.children) {
        if (named.label !== "Marked::Named") continue;
        const key = identifier(named.children[0]);
        const valueNode = namedValue(named);
        if (key && valueNode) record[key] = readDeclaredLiteral(valueNode, lines);
      }
      schema.push(record);
    }
    break;
  }

  return normalizeDeclaredFields(schema);
}
