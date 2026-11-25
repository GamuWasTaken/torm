import { Show, type Accessor } from "solid-js";
import type { FormField } from "../schema";
import { DocumentForm } from "./DocumentForm";
import { PreviewPanel } from "./PreviewPanel";
import { SchemaTable } from "./SchemaTable";

interface EditorViewProps {
  entryName: Accessor<string>;
  status: Accessor<string>;
  schemaNotice: Accessor<string>;
  fields: Accessor<FormField[]>;
  values: Accessor<Record<string, string>>;
  inputsValid: Accessor<boolean>;
  live: Accessor<boolean>;
  rendering: Accessor<boolean>;
  svg: Accessor<string>;
  onBack: () => void;
  onDelete: () => void;
  onFieldChange: (name: string, value: string) => void;
  onToggleLive: (enabled: boolean) => void;
  onRender: () => void;
}

export function EditorView(props: EditorViewProps) {
  return (
    <section class="editor">
      <div class="editor-header">
        <button type="button" class="link-button" onClick={props.onBack}>
          ← Library
        </button>
        <h2>{props.entryName()}</h2>
        <button type="button" class="danger" onClick={props.onDelete}>
          Delete
        </button>
      </div>
      <p class="status" role="status">
        {props.status()}
      </p>
      <Show when={!props.inputsValid()}>
        <p class="notice" role="status">
          Fill in all required inputs before rendering.
        </p>
      </Show>
      <Show when={props.schemaNotice()}>
        <p class="notice">{props.schemaNotice()}</p>
      </Show>

      <div class="workspace">
        <Show
          when={props.fields().length > 0}
          fallback={<aside class="form empty-form">No inputs discovered in this document.</aside>}
        >
          <DocumentForm
            fields={props.fields}
            values={props.values}
            inputsValid={props.inputsValid}
            live={props.live}
            rendering={props.rendering}
            onFieldChange={props.onFieldChange}
            onToggleLive={props.onToggleLive}
            onRender={props.onRender}
          />
        </Show>

        <PreviewPanel svg={props.svg} rendering={props.rendering} />
      </div>

      <Show when={props.fields().length > 0}>
        <SchemaTable fields={props.fields} />
      </Show>
    </section>
  );
}
