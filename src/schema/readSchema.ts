import { $typst } from "@myriaddreamin/typst.ts";
import { parseSourceAst } from "./ast";
import { normalizeDeclaredFields, readDeclaredFields } from "./declared";
import { readInferredFields } from "./inferred";
import type { FormField } from "./model";

const AST_VIRTUAL_PATH = "/main.typ";

async function readAstDump(source: string): Promise<string> {
  try {
    await $typst.addSource(AST_VIRTUAL_PATH, source);
    const compiler = await $typst.getCompiler();
    return await compiler.getAst(AST_VIRTUAL_PATH);
  } catch {
    return "";
  }
}

async function queryDeclaredFields(source: string): Promise<FormField[]> {
  try {
    const value = await $typst.query<unknown>({
      mainContent: source,
      selector: "<form-schema>",
      field: "value",
    });
    return normalizeDeclaredFields(value);
  } catch {
    return [];
  }
}

export async function readSchema(source: string): Promise<FormField[]> {
  const ast = await readAstDump(source);
  const parsed = ast ? parseSourceAst(ast, source) : null;

  let declared = parsed ? readDeclaredFields(parsed) : [];
  if (declared.length === 0) declared = await queryDeclaredFields(source);

  const inferred = parsed ? readInferredFields(parsed) : [];
  const declaredNames = new Set(declared.map((field) => field.name));
  return [...declared, ...inferred.filter((field) => !declaredNames.has(field.name))];
}
