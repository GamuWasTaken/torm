import { $typst } from "@myriaddreamin/typst.ts";

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "textarea";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  default: string;
  options: string[];
  origin: "declared" | "inferred";
}

interface AstRange {
  line: number;
  start: number;
  end: number;
}

interface AstNode {
  label: string;
  range?: AstRange;
  children: AstNode[];
}

const AST_PATH = "/main.typ";

const FIELD_TYPES: FieldType[] = [
  "text",
  "number",
  "boolean",
  "select",
  "date",
  "textarea",
];

function cleanLabel(raw: string): { label: string; range?: AstRange } {
  const text = raw
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

  const match = /^(.*?)\s*(<(\d+):(\d+)~(\d+):(\d+)>)$/.exec(text);
  if (!match) return { label: text };

  return {
    label: match[1].trim(),
    range: {
      line: Number(match[3]),
      start: Number(match[4]),
      end: Number(match[6]),
    },
  };
}

function parseAst(dump: string): AstNode | null {
  let root: AstNode | null = null;
  const stack: { indent: number; node: AstNode }[] = [];

  for (const line of dump.split("\n")) {
    const match = /^(\s*)(?:- )?(s|c):\s?(.*)$/.exec(line);
    if (!match || match[2] !== "s") continue;

    const node: AstNode = { ...cleanLabel(match[3]), children: [] };
    if (!root) {
      root = node;
      continue;
    }
    if (!/^\s*- /.test(line)) continue;

    const indent = match[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.node ?? root;
    parent.children.push(node);
    stack.push({ indent, node });
  }

  return root;
}

function descendants(node: AstNode): AstNode[] {
  return [node, ...node.children.flatMap(descendants)];
}

function identifier(node: AstNode): string | undefined {
  const match = /^(?:Marked|Fn)::\(Ident: "([^"]+)"\)$/.exec(node.label);
  return match?.[1];
}

function stringLiteral(node: AstNode): string | undefined {
  const match = /^Str\("(.*)"\)$/.exec(node.label);
  return match?.[1];
}

function sourceText(node: AstNode, lines: string[]): string {
  if (!node.range) return "";
  return (lines[node.range.line - 1] ?? "").slice(node.range.start, node.range.end).trim();
}

function literalType(node: AstNode): FieldType {
  if (stringLiteral(node) !== undefined) return "text";
  if (/^Num\((Int|Float),/.test(node.label)) return "number";
  if (node.label === "Kw::Bool") return "boolean";
  return "text";
}

function literalValue(node: AstNode, lines: string[]): string {
  return stringLiteral(node) ?? sourceText(node, lines);
}

function isSysInputsAt(node: AstNode): boolean {
  return descendants(node)
    .map(identifier)
    .filter((name): name is string => Boolean(name))
    .join(".") === "sys.inputs.at";
}

function directInputName(node: AstNode): string | undefined {
  if (node.label !== "Marked::FieldAccess") return undefined;
  const names = descendants(node)
    .map(identifier)
    .filter((name): name is string => Boolean(name));
  if (names.length === 3 && names[0] === "sys" && names[1] === "inputs") {
    return names[2];
  }
  return undefined;
}

function skipSubtree(node: AstNode, skipped: WeakSet<AstNode>): void {
  for (const descendant of descendants(node)) skipped.add(descendant);
}

function fieldsFromAst(dump: string, source: string): FormField[] {
  const root = parseAst(dump);
  if (!root) return [];

  const lines = source.split("\n");
  const fields = new Map<string, FormField>();
  const skipped = new WeakSet<AstNode>();

  const add = (field: FormField) => {
    const existing = fields.get(field.name);
    if (!existing) {
      fields.set(field.name, field);
      return;
    }
    const betterType = existing.type === "text" && field.type !== "text";
    const betterDefault = !existing.default && field.default;
    if (betterType || betterDefault) {
      fields.set(field.name, {
        ...existing,
        type: betterType ? field.type : existing.type,
        default: betterDefault ? field.default : existing.default,
      });
    }
  };

  const walk = (node: AstNode) => {
    if (skipped.has(node)) return;

    if (node.label === "Marked::FuncCall") {
      const callee = node.children[0];
      const args = node.children.find((child) => child.label === "Marked::Args");

      if (callee && isSysInputsAt(callee) && args) {
        const keyNode = args.children.find((child) => stringLiteral(child) !== undefined);
        const key = keyNode ? stringLiteral(keyNode) : undefined;
        const named = args.children.find((child) => child.label === "Marked::Named");
        const defaultNode = named?.children.find(
          (child) => child !== named.children[0] && child.label !== "Punc::Colon",
        );

        if (key) {
          add({
            name: key,
            label: key,
            type: defaultNode ? literalType(defaultNode) : "text",
            default: defaultNode ? literalValue(defaultNode, lines) : "",
            options: [],
            origin: "inferred",
          });
        }

        skipSubtree(callee, skipped);
        for (const child of node.children) {
          if (child !== callee) walk(child);
        }
        return;
      }

      const conversion = /^Fn::\(Ident: "(int|float|bool)"\)$/.exec(callee?.label ?? "");
      if (conversion && args) {
        const target = descendants(args).find((child) => directInputName(child));
        const name = target ? directInputName(target) : undefined;
        if (name && target) {
          add({
            name,
            label: name,
            type: conversion[1] === "bool" ? "boolean" : "number",
            default: conversion[1] === "bool" ? "false" : "0",
            options: [],
            origin: "inferred",
          });
          skipSubtree(target, skipped);
        }
      }
    }

    const direct = directInputName(node);
    if (direct) {
      add({
        name: direct,
        label: direct,
        type: "text",
        default: "",
        options: [],
        origin: "inferred",
      });
    }

    for (const child of node.children) walk(child);
  };

  walk(root);
  return [...fields.values()];
}

function asFieldType(value: unknown): FieldType {
  const text = String(value ?? "text").toLowerCase();
  return FIELD_TYPES.includes(text as FieldType) ? (text as FieldType) : "text";
}

export function normalizeDeclared(value: unknown): FormField[] {
  const items = (Array.isArray(value) ? value.flat(1) : [value]).filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );

  return items
    .map((item) => {
      const name = String(item.name ?? "");
      const options = Array.isArray(item.options)
        ? item.options.map(String)
        : typeof item.options === "string"
          ? item.options.split(",").map((option) => option.trim())
          : [];
      return {
        name,
        label: String(item.label ?? name),
        type: asFieldType(item.type),
        default: item.default === undefined || item.default === null ? "" : String(item.default),
        options,
        origin: "declared" as const,
      };
    })
    .filter((field) => field.name.length > 0);
}

function literalArray(node: AstNode): string[] {
  if (node.label !== "Marked::Array") return [];
  return node.children.flatMap((child) => {
    const value = stringLiteral(child);
    return value === undefined ? [] : [value];
  });
}

function literal(node: AstNode, lines: string[]): unknown {
  const value = stringLiteral(node);
  if (value !== undefined) return value;
  if (node.label === "Marked::Array") return literalArray(node);
  return sourceText(node, lines);
}

function declaredFromAst(dump: string, source: string): FormField[] {
  const root = parseAst(dump);
  if (!root) return [];

  const lines = source.split("\n");
  const schema: Record<string, unknown>[] = [];

  for (const node of descendants(root)) {
    if (node.label !== "Marked::LetBinding") continue;
    const hasName = node.children.some((child) =>
      /^Marked::\(Ident: "form-schema"\)$/.test(child.label),
    );
    if (!hasName) continue;

    const array = node.children.find((child) => child.label === "Marked::Array");
    if (!array) continue;

    for (const dict of array.children) {
      if (dict.label !== "Marked::Dict") continue;
      const record: Record<string, unknown> = {};
      for (const named of dict.children) {
        if (named.label !== "Marked::Named") continue;
        const key = identifier(named.children[0]);
        const valueNode = named.children.find(
          (child) => child !== named.children[0] && child.label !== "Punc::Colon",
        );
        if (key && valueNode) record[key] = literal(valueNode, lines);
      }
      schema.push(record);
    }
    break;
  }

  return normalizeDeclared(schema);
}

export async function readSchema(source: string): Promise<FormField[]> {
  let ast = "";
  try {
    await $typst.addSource(AST_PATH, source);
    const compiler = await $typst.getCompiler();
    ast = await compiler.getAst(AST_PATH);
  } catch {
    ast = "";
  }

  let declared = ast ? declaredFromAst(ast, source) : [];
  if (declared.length === 0) {
    try {
      const value = await $typst.query<unknown>({
        mainContent: source,
        selector: "<form-schema>",
        field: "value",
      });
      declared = normalizeDeclared(value);
    } catch {
      declared = [];
    }
  }

  const inferred = ast ? fieldsFromAst(ast, source) : [];
  const known = new Set(declared.map((field) => field.name));
  return [...declared, ...inferred.filter((field) => !known.has(field.name))];
}

export function initialValues(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.default]));
}
