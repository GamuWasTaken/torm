import {
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { initialValues, readSchema, type FormField } from "./form";
import { loadLibrary, makeId, saveLibrary, type LibraryEntry } from "./library";
import { renderTypst } from "./typst";
import "./App.css";

function App() {
  const [library, setLibrary] = createSignal<LibraryEntry[]>(loadLibrary());
  const [selectedId, setSelectedId] = createSignal("");
  const [thumbnails, setThumbnails] = createSignal<Record<string, string>>({});
  const [source, setSource] = createSignal("");
  const [fileName, setFileName] = createSignal("");
  const [fields, setFields] = createSignal<FormField[]>([]);
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [live, setLive] = createSignal(true);
  const [svg, setSvg] = createSignal("");
  const [error, setError] = createSignal("");
  const [schemaError, setSchemaError] = createSignal("");
  const [libraryError, setLibraryError] = createSignal("");
  const [rendering, setRendering] = createSignal(false);
  const [discovering, setDiscovering] = createSignal(false);

  const selected = () => library().find((entry) => entry.id === selectedId());

  let requestId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let typstChain: Promise<void> = Promise.resolve();
  let thumbnailQueue: string[] = [];
  let thumbnailRunning = false;

  const withTypst = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = typstChain.then(task, task);
    typstChain = result.then(() => undefined, () => undefined);
    return result;
  };

  createEffect(() => {
    try {
      saveLibrary(library());
    } catch {
      setLibraryError("Browser storage is full; recent documents may not persist.");
    }
  });

  onCleanup(() => clearTimeout(debounceTimer));

  const runThumbnailQueue = async () => {
    if (thumbnailRunning) return;
    thumbnailRunning = true;
    try {
      while (thumbnailQueue.length > 0) {
        const id = thumbnailQueue.shift() ?? "";
        const entry = library().find((item) => item.id === id);
        if (!entry || thumbnails()[id]) continue;
        try {
          const result = await withTypst(() =>
            renderTypst(entry.source, initialValues(entry.fields)),
          );
          if (
            result.includes("<svg") &&
            library().some((item) => item.id === id)
          ) {
            setThumbnails((previous) => ({ ...previous, [id]: result }));
          }
        } catch {
          setThumbnails((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          });
        }
      }
    } finally {
      thumbnailRunning = false;
    }
  };

  const queueThumbnail = (entry: LibraryEntry) => {
    if (thumbnails()[entry.id] || thumbnailQueue.includes(entry.id)) return;
    thumbnailQueue.push(entry.id);
    void runThumbnailQueue();
  };

  for (const entry of library()) queueThumbnail(entry);

  const render = async () => {
    const currentSource = source();
    if (!currentSource) return;

    const current = ++requestId;
    setRendering(true);
    try {
      const result = await withTypst(() => renderTypst(currentSource, values()));
      if (current !== requestId) return;
      if (!result.includes("<svg")) {
        throw new Error("Typst did not produce an SVG. Check the document for errors.");
      }
      setSvg(result);
      setError("");
    } catch (cause) {
      if (current !== requestId) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setSvg("");
    } finally {
      if (current === requestId) setRendering(false);
    }
  };

  const scheduleRender = () => {
    if (!live() || !source()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void render(), 250);
  };

  const setFieldValue = (name: string, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    scheduleRender();
  };

  const saveEntry = (
    name: string,
    text: string,
    discovered: FormField[],
  ): LibraryEntry => {
    const existing = library().find((entry) => entry.name === name);
    const entry: LibraryEntry = {
      id: existing?.id ?? makeId(),
      name,
      source: text,
      fields: discovered,
      updatedAt: Date.now(),
    };
    setLibrary((previous) => [entry, ...previous.filter((item) => item.id !== entry.id)]);
    setThumbnails((previous) => {
      const next = { ...previous };
      delete next[entry.id];
      return next;
    });
    return entry;
  };

  const selectEntry = (entry: LibraryEntry) => {
    ++requestId;
    clearTimeout(debounceTimer);
    setSelectedId(entry.id);
    setFileName(entry.name);
    setSource(entry.source);
    setFields(entry.fields);
    setValues(initialValues(entry.fields));
    setError("");
    setSchemaError("");
    const thumbnail = thumbnails()[entry.id];
    setSvg(thumbnail && thumbnail.includes("<svg") ? thumbnail : "");
    void render();
  };

  const showLibrary = () => {
    ++requestId;
    clearTimeout(debounceTimer);
    setSelectedId("");
    setSource("");
    setSvg("");
    setError("");
    setSchemaError("");
  };

  const removeSelected = () => {
    const id = selectedId();
    if (!id) return;
    setLibrary((previous) => previous.filter((entry) => entry.id !== id));
    setThumbnails((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    showLibrary();
  };

  const handleFileChange = async (
    event: Event & { currentTarget: HTMLInputElement },
  ) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const current = ++requestId;
    clearTimeout(debounceTimer);
    setFileName(file.name);
    setError("");
    setSchemaError("");
    setLibraryError("");
    setSvg("");
    setFields([]);
    setValues({});
    setSource("");
    setDiscovering(true);

    try {
      const text = await file.text();
      if (current !== requestId) return;
      setSource(text);
      const discovered = await withTypst(() => readSchema(text));
      if (current !== requestId) return;
      const entry = saveEntry(file.name, text, discovered);
      queueThumbnail(entry);
      setSelectedId(entry.id);
      setFields(discovered);
      setValues(initialValues(discovered));
      if (discovered.length === 0) {
        setSchemaError("No inputs discovered; rendering the document as-is.");
      }
    } catch (cause) {
      if (current !== requestId) return;
      setSchemaError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === requestId) {
        setDiscovering(false);
        void render();
      }
    }
  };

  return (
    <main class="app">
      <header class="header">
        <div>
          <h1>Typst SVG library</h1>
          <p class="subtitle">{library().length} saved document(s)</p>
        </div>
        <input
          type="file"
          accept=".typ,text/plain"
          onChange={handleFileChange}
          aria-label="Typst document"
        />
      </header>

      <Show when={libraryError()}>
        <p class="notice" role="alert">
          {libraryError()}
        </p>
      </Show>
      <Show when={error()}>
        <p class="error" role="alert">
          {error()}
        </p>
      </Show>

      <Show
        when={!selected()}
        fallback={
          <section class="editor">
            <div class="editor-header">
              <button type="button" class="link-button" onClick={showLibrary}>
                ← Library
              </button>
              <h2>{selected()?.name}</h2>
              <button type="button" class="danger" onClick={removeSelected}>
                Delete
              </button>
            </div>
            <p class="status" role="status">
              {discovering()
                ? `Reading ${fileName()}...`
                : rendering()
                  ? `Rendering ${fileName()}...`
                  : `Editing ${fileName()}`}
            </p>
            <Show when={schemaError()}>
              <p class="notice">{schemaError()}</p>
            </Show>

            <div class="workspace">
              <Show
                when={fields().length > 0}
                fallback={
                  <aside class="form empty-form">
                    No inputs discovered in this document.
                  </aside>
                }
              >
                <section class="form">
                  <h2>Document inputs</h2>
                  <For each={fields()}>
                    {(field, index) => {
                      const id = `field-${index()}`;
                      const update = (value: string) =>
                        setFieldValue(field.name, value);
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
                                checked={values()[field.name] === "true"}
                                onChange={(event) =>
                                  update(
                                    event.currentTarget.checked ? "true" : "false",
                                  )
                                }
                              />
                            </Match>
                            <Match when={field.type === "select"}>
                              <select
                                id={id}
                                value={values()[field.name]}
                                onChange={(event) => update(event.currentTarget.value)}
                              >
                                <For
                                  each={
                                    field.options.length > 0
                                      ? field.options
                                      : [values()[field.name]]
                                  }
                                >
                                  {(option) => (
                                    <option value={option}>{option}</option>
                                  )}
                                </For>
                              </select>
                            </Match>
                            <Match when={field.type === "textarea"}>
                              <textarea
                                id={id}
                                value={values()[field.name]}
                                onInput={(event) => update(event.currentTarget.value)}
                              />
                            </Match>
                            <Match when={["text", "number", "date"].includes(field.type)}>
                              <input
                                id={id}
                                type={field.type}
                                value={values()[field.name]}
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
                        checked={live()}
                        onChange={(event) => {
                          setLive(event.currentTarget.checked);
                          if (event.currentTarget.checked) scheduleRender();
                        }}
                      />
                      Live update
                    </label>
                    <button
                      type="button"
                      onClick={() => void render()}
                      disabled={rendering()}
                    >
                      Render
                    </button>
                  </div>
                </section>
              </Show>

              <section class="preview-panel">
                <Show
                  when={svg()}
                  fallback={
                    <p class="preview-placeholder">
                      {rendering() ? "Rendering..." : "No preview available."}
                    </p>
                  }
                >
                  <div class="preview" innerHTML={svg()} />
                </Show>
              </section>
            </div>

            <Show when={fields().length > 0}>
              <details class="schema">
                <summary>Discovered inputs ({fields().length})</summary>
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
                    <For each={fields()}>
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
            </Show>
          </section>
        }
      >
        <section class="library">
          <h2>Your documents</h2>
          <Show
            when={library().length > 0}
            fallback={
              <p class="empty">
                No documents saved yet. Upload a .typ file to start your library.
              </p>
            }
          >
            <div class="library-grid">
              <For each={library()}>
                {(entry) => (
                  <button
                    type="button"
                    class="card"
                    onClick={() => selectEntry(entry)}
                  >
                    <span class="thumb-frame">
                      <Show
                        when={thumbnails()[entry.id]}
                        fallback={<span class="thumb-placeholder">Preview…</span>}
                      >
                        {(thumbnail) => (
                          <span class="thumb" innerHTML={thumbnail()} />
                        )}
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
      </Show>
    </main>
  );
}

export default App;
