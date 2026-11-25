import type { FieldType } from "./model";

interface AstRange {
  line: number;
  start: number;
  endLine: number;
  end: number;
}

export interface AstNode {
  label: string;
  range?: AstRange;
  children: AstNode[];
}

export interface ParsedAst {
  root: AstNode;
  lines: string[];
}

function decodeLabel(raw: string): string {
  return raw
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function splitSourceRange(text: string): { label: string; range?: AstRange } {
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

function parseAstDump(dump: string): AstNode | null {
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

    const node: AstNode = { ...splitSourceRange(decodeLabel(match[3])), children: [] };
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

export function parseSourceAst(dump: string, source: string): ParsedAst | null {
  const root = parseAstDump(dump);
  return root ? { root, lines: source.split("\n") } : null;
}

export function descendants(node: AstNode): AstNode[] {
  return [node, ...node.children.flatMap(descendants)];
}

export function identifier(node: AstNode): string | undefined {
  const match = /^(?:Marked|Fn)::\(Ident: "([^"]+)"\)$/.exec(node.label);
  return match?.[1];
}

export function fieldPath(node: AstNode): string[] | undefined {
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

export function stringLiteral(node: AstNode): string | undefined {
  const match = /^Str\("([\s\S]*)"\)$/.exec(node.label);
  return match?.[1];
}

export function sourceSlice(node: AstNode, lines: string[]): string {
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

export function literalType(node: AstNode): FieldType {
  if (stringLiteral(node) !== undefined) return "text";
  if (/^Num\((Int|Float),/.test(node.label)) return "number";
  if (node.label === "Kw::Bool") return "boolean";
  return "text";
}

export function literalValue(node: AstNode, lines: string[]): string {
  return stringLiteral(node) ?? sourceSlice(node, lines);
}

export function isSysInputsAt(node: AstNode): boolean {
  return fieldPath(node)?.join(".") === "sys.inputs.at";
}

export function directInputName(node: AstNode): string | undefined {
  const path = fieldPath(node);
  return path?.length === 3 && path[0] === "sys" && path[1] === "inputs" && path[2] !== "at"
    ? path[2]
    : undefined;
}

export function namedArgument(args: AstNode, key: string): AstNode | undefined {
  return args.children.find(
    (child) => child.label === "Marked::Named" && identifier(child.children[0]) === key,
  );
}

export function namedValue(named: AstNode): AstNode | undefined {
  return named.children.find(
    (child, index) => index !== 0 && child.label !== "Punc::Colon",
  );
}

export function atCallArgs(node: AstNode): AstNode | undefined {
  if (node.label !== "Marked::FuncCall" || !isSysInputsAt(node.children[0])) return undefined;
  return node.children.find((child) => child.label === "Marked::Args");
}
