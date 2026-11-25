import { Show, type Accessor } from "solid-js";

interface PreviewPanelProps {
  svg: Accessor<string>;
  rendering: Accessor<boolean>;
  exporting: Accessor<boolean>;
  inputsValid: Accessor<boolean>;
  onDownloadPdf: () => void;
}

export function PreviewPanel(props: PreviewPanelProps) {
  return (
    <section class="preview-panel">
      <div class="preview-header">
        <h2>Preview</h2>
        <button
          type="button"
          onClick={props.onDownloadPdf}
          disabled={!props.svg() || !props.inputsValid() || props.rendering() || props.exporting()}
        >
          {props.exporting() ? "Exporting..." : "Download PDF"}
        </button>
      </div>
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
