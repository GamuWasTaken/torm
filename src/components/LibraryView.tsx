import { For, Show, type Accessor } from "solid-js";
import type { LibraryEntry } from "../library";

interface LibraryViewProps {
  entries: Accessor<LibraryEntry[]>;
  thumbnails: Accessor<Record<string, string>>;
  onOpen: (entry: LibraryEntry) => void;
}

export function LibraryView(props: LibraryViewProps) {
  return (
    <section class="library">
      <h2>Your documents</h2>
      <Show
        when={props.entries().length > 0}
        fallback={
          <p class="empty">
            No documents saved yet. Upload a .typ file to start your library.
          </p>
        }
      >
        <div class="library-grid">
          <For each={props.entries()}>
            {(entry) => (
              <button type="button" class="card" onClick={() => props.onOpen(entry)}>
                <span class="thumb-frame">
                  <Show
                    when={props.thumbnails()[entry.id]}
                    fallback={<span class="thumb-placeholder">Preview…</span>}
                  >
                    {(thumbnail) => <span class="thumb" innerHTML={thumbnail()} />}
                  </Show>
                </span>
                <span class="card-name">{entry.name}</span>
                <span class="card-meta">{entry.fields.length} input(s)</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
