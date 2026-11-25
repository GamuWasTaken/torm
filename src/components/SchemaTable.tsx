import { For, type Accessor } from "solid-js";
import type { FormField } from "../schema";

interface SchemaTableProps {
  fields: Accessor<FormField[]>;
}

export function SchemaTable(props: SchemaTableProps) {
  return (
    <details class="schema">
      <summary>Discovered inputs ({props.fields().length})</summary>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Default</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.fields()}>
            {(field) => (
              <tr>
                <td>{field.name}</td>
                <td>{field.type}</td>
                <td>{field.default || "—"}</td>
                <td>{field.origin}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </details>
  );
}
