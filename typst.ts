import { $typst } from "@myriaddreamin/typst.ts";
import type { WebAssemblyModuleRef } from "@myriaddreamin/typst.ts/wasm";
import compilerWasm from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";

const wasmRef = (url: string) =>
  ({ module_or_path: url }) as unknown as WebAssemblyModuleRef;

$typst.setCompilerInitOptions({
  getModule: () => wasmRef(compilerWasm),
});

$typst.setRendererInitOptions({
  getModule: () => wasmRef(rendererWasm),
});

export async function renderTypst(
  source: string,
  inputs: Record<string, string> = {},
): Promise<string> {
  const svg = await $typst.svg({
    mainContent: source,
    inputs,
    data_selection: { body: true, defs: true, css: true, js: false },
  });

  const parsed = new DOMParser().parseFromString(svg, "text/html");
  for (const element of Array.from(parsed.body.querySelectorAll("*"))) {
    if (element.localName === "script" || element.localName === "foreignObject") {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return parsed.body.innerHTML;
}
