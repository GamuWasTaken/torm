import { $typst } from "@myriaddreamin/typst.ts";
import compilerWasm from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";

$typst.setCompilerInitOptions({
  getModule: () => compilerWasm,
});

$typst.setRendererInitOptions({
  getModule: () => rendererWasm,
});

export function sanitizeSvg(svg: string): string {
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

export async function renderTypst(
  source: string,
  inputs: Record<string, string> = {},
): Promise<string> {
  const svg = await $typst.svg({
    mainContent: source,
    inputs,
    data_selection: { body: true, defs: true, css: true, js: false },
  });
  return sanitizeSvg(svg);
}
