import { createSignal, onCleanup } from "solid-js";
import type { LibraryEntry } from "../library";
import { initialValues, readSchema, type FormField } from "../schema";
import { renderTypst } from "../typst";
import { errorMessage, isSvg, statusLabel } from "../utils";
import type { TypstQueue } from "./useTypstQueue";

type FileChangeEvent = Event & { currentTarget: HTMLInputElement };

interface DocumentSessionOptions {
  runTypst: TypstQueue["run"];
  openEntry(id: string): void;
  clearSelection(): void;
  saveDiscovered(name: string, source: string, fields: FormField[]): LibraryEntry;
  selectDiscovered(id: string): void;
  clearLibraryError(): void;
  getThumbnail(id: string): string | undefined;
}

export function useDocumentSession(options: DocumentSessionOptions) {
  const [fileName, setFileName] = createSignal("");
  const [source, setSource] = createSignal("");
  const [fields, setFields] = createSignal<FormField[]>([]);
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [live, setLive] = createSignal(true);
  const [svg, setSvg] = createSignal("");
  const [renderError, setRenderError] = createSignal("");
  const [schemaNotice, setSchemaNotice] = createSignal("");
  const [rendering, setRendering] = createSignal(false);
  const [discovering, setDiscovering] = createSignal(false);

  let operationToken = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(debounceTimer));

  const status = () =>
    statusLabel({
      discovering: discovering(),
      rendering: rendering(),
      fileName: fileName(),
    });

  const isStale = (token: number) => token !== operationToken;

  const beginOperation = () => {
    const token = ++operationToken;
    clearTimeout(debounceTimer);
    setRendering(false);
    setDiscovering(false);
    return token;
  };

  const resetEditor = () => {
    setSource("");
    setSvg("");
    setFields([]);
    setValues({});
    setRenderError("");
    setSchemaNotice("");
  };

  const render = async () => {
    const snapshot = source();
    if (!snapshot) return;

    const token = ++operationToken;
    setRendering(true);
    try {
      const result = await options.runTypst(() => renderTypst(snapshot, values()));
      if (isStale(token)) return;
      if (!isSvg(result)) {
        throw new Error("Typst did not produce an SVG. Check the document for errors.");
      }
      setSvg(result);
      setRenderError("");
    } catch (cause) {
      if (isStale(token)) return;
      setRenderError(errorMessage(cause));
      setSvg("");
    } finally {
      if (!isStale(token)) setRendering(false);
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

  const changeLive = (enabled: boolean) => {
    setLive(enabled);
    if (enabled) scheduleRender();
  };

  const openDocument = (entry: LibraryEntry) => {
    beginOperation();
    options.openEntry(entry.id);
    setFileName(entry.name);
    resetEditor();
    setSource(entry.source);
    setFields(entry.fields);
    setValues(initialValues(entry.fields));
    const thumbnail = options.getThumbnail(entry.id);
    if (isSvg(thumbnail)) setSvg(thumbnail);
    void render();
  };

  const backToLibrary = () => {
    beginOperation();
    options.clearSelection();
    setFileName("");
    resetEditor();
  };

  const handleFilesChange = async (event: FileChangeEvent) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    if (selected.length === 0) return;

    const unique = new Map<string, File>();
    for (const file of selected) unique.set(file.name, file);
    const files = [...unique.values()];

    const isBatch = files.length > 1;
    const token = beginOperation();
    if (isBatch) options.clearSelection();
    setFileName(isBatch ? `${files.length} files` : files[0].name);
    options.clearLibraryError();
    resetEditor();
    setDiscovering(true);

    const discoveredEntries: { entry: LibraryEntry; fields: FormField[] }[] = [];
    let firstError = "";

    try {
      for (const file of files) {
        if (isStale(token)) return;
        try {
          const text = await file.text();
          if (isStale(token)) return;
          setSource(text);
          const fields = await options.runTypst(() => readSchema(text));
          if (isStale(token)) return;
          const entry = options.saveDiscovered(file.name, text, fields);
          discoveredEntries.push({ entry, fields });
        } catch (cause) {
          if (isStale(token)) return;
          if (!firstError) firstError = errorMessage(cause);
        }
      }

      if (isStale(token)) return;
      if (isBatch) {
        resetEditor();
        setFileName("");
        if (firstError) setRenderError(firstError);
      } else {
        const active = discoveredEntries[0];
        if (active) {
          setFileName(active.entry.name);
          setSource(active.entry.source);
          setFields(active.fields);
          setValues(initialValues(active.fields));
          options.selectDiscovered(active.entry.id);
          if (!firstError && active.fields.length === 0) {
            setSchemaNotice("No inputs discovered; rendering the document as-is.");
          }
        }
        if (firstError) setSchemaNotice(firstError);
      }
    } finally {
      if (!isStale(token)) {
        setDiscovering(false);
        if (!isBatch) void render();
      }
    }
  };

  return {
    fileName,
    source,
    fields,
    values,
    live,
    svg,
    renderError,
    schemaNotice,
    rendering,
    discovering,
    status,
    render,
    setFieldValue,
    changeLive,
    openDocument,
    backToLibrary,
    handleFilesChange,
  };
}
