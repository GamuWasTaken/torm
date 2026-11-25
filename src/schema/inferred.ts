import {
  atCallArgs,
  descendants,
  directInputName,
  literalType,
  literalValue,
  namedArgument,
  namedValue,
  stringLiteral,
  type AstNode,
  type ParsedAst,
} from "./ast";
import type { FieldType, FormField } from "./model";

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

function readAtCallField(node: AstNode, lines: string[]): FormField | undefined {
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

function skipSubtree(node: AstNode, skipped: WeakSet<AstNode>): void {
  for (const descendant of descendants(node)) skipped.add(descendant);
}

export function readInferredFields(parsed: ParsedAst): FormField[] {
  const { root, lines } = parsed;
  const fields = new Map<string, FormField>();
  const skipped = new WeakSet<AstNode>();

  const add = (field: FormField) => {
    const existing = fields.get(field.name);
    if (!existing) {
      fields.set(field.name, field);
      return;
    }

    const upgradedType = existing.type === "text" && field.type !== "text";
    const filledDefault = !existing.default && field.default;
    if (upgradedType || filledDefault) {
      fields.set(field.name, {
        ...existing,
        type: upgradedType ? field.type : existing.type,
        default: filledDefault ? field.default : existing.default,
      });
    }
  };

  const walk = (node: AstNode) => {
    if (skipped.has(node)) return;

    if (node.label === "Marked::FuncCall") {
      const callee = node.children[0];
      const args = node.children.find((child) => child.label === "Marked::Args");
      const atCall = atCallArgs(node);

      if (atCall) {
        const field = readAtCallField(node, lines);
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
          const field = readAtCallField(call, lines);
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
