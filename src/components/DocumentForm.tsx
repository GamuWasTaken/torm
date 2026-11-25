import { For, Match, Switch, type Accessor } from "solid-js";
import type { FormField } from "../schema";

interface DocumentFormProps {
  fields: Accessor<FormField[]>;
  values: Accessor<Record<string, string>>;
  live: Accessor<boolean>;
  rendering: Accessor<boolean>;
  onFieldChange: (name: string, value: string) => void;
  onToggleLive: (enabled: boolean) => void;
  onRender: () => void;
}

export function DocumentForm(props: DocumentFormProps) {
  return (
    <section class="form">
      <h2>Document inputs</h2>
      <For each={props.fields()}>
        {(field, index) => {
          const id = `field-${index()}`;
          const update = (value: string) => props.onFieldChange(field.name, value);
          return (
            <div class="field">
              <label for={id}>
                {field.label} <span class="type">{field.type}</span>
              </label>
              <Switch>
                <Match when={field.type === "boolean"}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={props.values()[field.name] === "true"}
                    onChange={(event) =>
                      update(event.currentTarget.checked ? "true" : "false")
                    }
                  />
                </Match>
                <Match when={field.type === "select"}>
                  <select
                    id={id}
                    value={props.values()[field.name]}
                    onChange={(event) => update(event.currentTarget.value)}
                  >
                    <For
                      each={
                        field.options.length > 0
                          ? field.options
                          : [props.values()[field.name]]
                      }
                    >
                      {(option) => <option value={option}>{option}</option>}
                    </For>
                  </select>
                </Match>
                <Match when={field.type === "textarea"}>
                  <textarea
                    id={id}
                    value={props.values()[field.name]}
                    onInput={(event) => update(event.currentTarget.value)}
                  />
                </Match>
                <Match when={["text", "number", "date"].includes(field.type)}>
                  <input
                    id={id}
                    type={field.type}
                    value={props.values()[field.name]}
                    onInput={(event) => update(event.currentTarget.value)}
                  />
                </Match>
              </Switch>
            </div>
          );
        }}
      </For>
      <div class="form-actions">
        <label class="toggle">
          <input
            type="checkbox"
            checked={props.live()}
            onChange={(event) => props.onToggleLive(event.currentTarget.checked)}
          />
          Live update
        </label>
        <button type="button" onClick={props.onRender} disabled={props.rendering()}>
          Render
        </button>
      </div>
    </section>
  );
}
