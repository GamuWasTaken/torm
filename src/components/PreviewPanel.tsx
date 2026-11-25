import { Show, type Accessor } from "solid-js";

interface PreviewPanelProps {
  svg: Accessor<string>;
  rendering: Accessor<boolean>;
}

export function PreviewPanel(props: PreviewPanelProps) {
  return (
    <section class="preview-panel">
      <Show
        when={props.svg()}
        fallback={
          <p class="preview-placeholder">
            {props.rendering() ? "Rendering..." : "No preview available."}
          </p>
        }
      >
        <div class="preview" innerHTML={props.svg()} />
      </Show>
    </section>
  );
}
