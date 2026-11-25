import { $typst } from "@myriaddreamin/typst.ts";

const FIELD_TYPES = [
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

interface AstRange {
  line: number;
  start: number;
  endLine: number;
  end: number;
}

interface AstNode {
  label: string;
  range?: AstRange;
  children: AstNode[];
}

interface ParsedAst {
  root: AstNode;
  lines: string[];
}

const AST_PATH = "/main.typ";

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

  const match = /^([\s\S]*?)\s*(<(\d+):(\d+)~(\d+):(\d+)>)$/.exec(text);
  if (!match) return { label: text };

  return {
    label: match[1].trim(),
    range: {
      line: Number(match[3]),
      start: Number(match[4]),
      endLine: Number(match[5]),
      end: Number(match[6]),
    },
  };
}

function parseAst(dump: string): AstNode | null {
  let root: AstNode | null = null;
  const stack: { indent: number; node: AstNode }[] = [];
  const nodeLine = /^\s*(?:- )?(?:s|c):\s?/;
  const lines: string[] = [];

  for (const line of dump.split("\n")) {
    if (nodeLine.test(line)) lines.push(line);
    else if (lines.length) lines[lines.length - 1] += `\n${line}`;
  }

  for (const line of lines) {
    const match = /^(\s*)(?:- )?(s|c):\s?([\s\S]*)$/.exec(line);
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

function parseDocument(dump: string, source: string): ParsedAst | null {
  const root = parseAst(dump);
  return root ? { root, lines: source.split("\n") } : null;
}

function descendants(node: AstNode): AstNode[] {
  return [node, ...node.children.flatMap(descendants)];
}

function identifier(node: AstNode): string | undefined {
  const match = /^(?:Marked|Fn)::\(Ident: "([^"]+)"\)$/.exec(node.label);
  return match?.[1];
}

function fieldPath(node: AstNode): string[] | undefined {
  if (node.label !== "Marked::FieldAccess") return undefined;

  const parts: string[] = [];
  for (const child of node.children) {
    if (child.label === "Punc::Dot") continue;

    const name = identifier(child);
    if (name) {
      parts.push(name);
      continue;
    }

    const base = fieldPath(child);
    if (base) {
      parts.push(...base);
      continue;
    }

    return undefined;
  }

  return parts.length > 0 ? parts : undefined;
}

function stringLiteral(node: AstNode): string | undefined {
  const match = /^Str\("([\s\S]*)"\)$/.exec(node.label);
  return match?.[1];
}

function sourceText(node: AstNode, lines: string[]): string {
  if (!node.range) return "";
  const { line, start, endLine, end } = node.range;
  if (line === endLine) {
    return (lines[line - 1] ?? "").slice(start, end).trim();
  }
  return [
    (lines[line - 1] ?? "").slice(start),
    ...lines.slice(line, endLine - 1),
    (lines[endLine - 1] ?? "").slice(0, end),
  ]
    .join("\n")
    .trim();
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
  return fieldPath(node)?.join(".") === "sys.inputs.at";
}

function directInputName(node: AstNode): string | undefined {
  const path = fieldPath(node);
  return path?.length === 3 && path[0] === "sys" && path[1] === "inputs" && path[2] !== "at"
    ? path[2]
    : undefined;
}

function skipSubtree(node: AstNode, skipped: WeakSet<AstNode>): void {
  for (const descendant of descendants(node)) skipped.add(descendant);
}

function namedArgument(args: AstNode, key: string): AstNode | undefined {
  return args.children.find(
    (child) => child.label === "Marked::Named" && identifier(child.children[0]) === key,
  );
}

function namedValue(named: AstNode): AstNode | undefined {
  return named.children.find(
    (child, index) => index !== 0 && child.label !== "Punc::Colon",
  );
}

function inferredField(name: string, type: FieldType, defaultValue: string): FormField {
  return {
    name,
    label: name,
    type,
    default: defaultValue,
    options: [],
    origin: "inferred",
  };
}

function atCallArgs(node: AstNode): AstNode | undefined {
  if (node.label !== "Marked::FuncCall" || !isSysInputsAt(node.children[0])) return undefined;
  return node.children.find((child) => child.label === "Marked::Args");
}

function atCallField(node: AstNode, lines: string[]): FormField | undefined {
  const args = atCallArgs(node);
  if (!args) return undefined;

  const keyNode = args.children.find((child) => stringLiteral(child) !== undefined);
  const key = keyNode ? stringLiteral(keyNode) : undefined;
  if (!key) return undefined;

  const named = namedArgument(args, "default");
  const defaultNode = named ? namedValue(named) : undefined;
  return inferredField(
    key,
    defaultNode ? literalType(defaultNode) : "text",
    defaultNode ? literalValue(defaultNode, lines) : "",
  );
}

function fieldsFromAst(parsed: ParsedAst): FormField[] {
  const { root, lines } = parsed;
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
        const field = atCallField(node, lines);
        if (field) add(field);

        skipSubtree(callee, skipped);
        for (const child of node.children) {
          if (child !== callee) walk(child);
        }
        return;
      }

      const conversion = /^Fn::\(Ident: "(int|float|bool)"\)$/.exec(callee?.label ?? "");
      if (conversion && args) {
        const type: FieldType = conversion[1] === "bool" ? "boolean" : "number";
        const fallback = type === "boolean" ? "false" : "0";
        const call = descendants(args).find((child) => atCallArgs(child));

        if (call) {
          const field = atCallField(call, lines);
          if (field) add({ ...field, type, default: field.default || fallback });
          skipSubtree(call, skipped);
        } else {
          const target = descendants(args).find((child) => directInputName(child));
          const name = target ? directInputName(target) : undefined;
          if (name && target) {
            add(inferredField(name, type, fallback));
            skipSubtree(target, skipped);
          }
        }
      }
    }

    const direct = directInputName(node);
    if (direct) add(inferredField(direct, "text", ""));

    for (const child of node.children) walk(child);
  };

  walk(root);
  return [...fields.values()];
}

function asFieldType(value: unknown): FieldType {
  const text = String(value ?? "text").toLowerCase();
  return FIELD_TYPES.includes(text as FieldType) ? (text as FieldType) : "text";
}

function normalizeDeclared(value: unknown): FormField[] {
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

function literal(node: AstNode, lines: string[]): unknown {
  const value = stringLiteral(node);
  if (value !== undefined) return value;
  if (node.label === "Marked::Array") {
    return node.children.flatMap((child) => {
      const item = stringLiteral(child);
      return item === undefined ? [] : [item];
    });
  }
  return sourceText(node, lines);
}

function declaredFromAst(parsed: ParsedAst): FormField[] {
  const { root, lines } = parsed;
  const schema: Record<string, unknown>[] = [];

  for (const node of descendants(root)) {
    if (node.label !== "Marked::LetBinding") continue;
    const hasName = node.children.some((child) => identifier(child) === "form-schema");
    if (!hasName) continue;

    const array = node.children.find((child) => child.label === "Marked::Array");
    if (!array) continue;

    for (const dict of array.children) {
      if (dict.label !== "Marked::Dict") continue;
      const record: Record<string, unknown> = {};
      for (const named of dict.children) {
        if (named.label !== "Marked::Named") continue;
        const key = identifier(named.children[0]);
        const valueNode = namedValue(named);
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

  const parsed = ast ? parseDocument(ast, source) : null;
  let declared = parsed ? declaredFromAst(parsed) : [];
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

  const inferred = parsed ? fieldsFromAst(parsed) : [];
  const known = new Set(declared.map((field) => field.name));
  return [...declared, ...inferred.filter((field) => !known.has(field.name))];
}

export function initialValues(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.default]));
}
