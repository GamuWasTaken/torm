import { createSignal, onCleanup } from "solid-js";
import type { LibraryEntry } from "../library";
import { hasInvalidInputs, initialValues, readSchema, type FormField } from "../schema";
import { renderTypst, renderTypstPdf } from "../typst";
import { errorMessage, isSvg, statusLabel } from "../utils";
import type { TypstQueue } from "./useTypstQueue";

const RENDER_DEBOUNCE_MS = 250;

type FileChangeEvent = Event & { currentTarget: HTMLInputElement };

interface DiscoveredDocument {
  entry: LibraryEntry;
  fields: FormField[];
}

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
  const [exporting, setExporting] = createSignal(false);
  const [discovering, setDiscovering] = createSignal(false);

  let requestId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(debounceTimer));

  const status = () =>
    statusLabel({
      discovering: discovering(),
      rendering: rendering(),
      fileName: fileName(),
    });

  const isStale = (id: number) => id !== requestId;
  const inputsValid = () => !hasInvalidInputs(fields(), values());

  const cancelRender = () => {
    requestId += 1;
    clearTimeout(debounceTimer);
    setRendering(false);
    setExporting(false);
    setRenderError("");
  };

  const beginOperation = () => {
    const id = ++requestId;
    clearTimeout(debounceTimer);
    setRendering(false);
    setExporting(false);
    setDiscovering(false);
    return id;
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
    if (!inputsValid()) {
      cancelRender();
      return;
    }

    const id = ++requestId;
    setExporting(false);
    setRendering(true);
    try {
      const result = await options.runTypst(() => renderTypst(snapshot, values()));
      if (isStale(id)) return;
      if (!isSvg(result)) {
        throw new Error("Typst did not produce an SVG. Check the document for errors.");
      }
      setSvg(result);
      setRenderError("");
    } catch (cause) {
      if (isStale(id)) return;
      setRenderError(errorMessage(cause));
      setSvg("");
    } finally {
      if (!isStale(id)) setRendering(false);
    }
  };

  const downloadPdf = async () => {
    const snapshot = source();
    if (!snapshot) return;
    if (!inputsValid()) {
      cancelRender();
      return;
    }

    const id = beginOperation();
    setExporting(true);
    try {
      const pdf = await options.runTypst(() => renderTypstPdf(snapshot, values()));
      if (isStale(id)) return;
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName().replace(/\.typ$/i, "") || "document"}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setRenderError("");
    } catch (cause) {
      if (isStale(id)) return;
      setRenderError(errorMessage(cause));
    } finally {
      if (!isStale(id)) setExporting(false);
    }
  };

  const scheduleRender = () => {
    clearTimeout(debounceTimer);
    if (!inputsValid()) {
      cancelRender();
      return;
    }
    if (!live() || !source()) return;
    debounceTimer = setTimeout(() => void render(), RENDER_DEBOUNCE_MS);
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

  const openDiscoveredFile = (document: DiscoveredDocument) => {
    setFileName(document.entry.name);
    setSource(document.entry.source);
    setFields(document.fields);
    setValues(initialValues(document.fields));
    options.selectDiscovered(document.entry.id);
  };

  const discoverFiles = async (files: File[], id: number) => {
    const discovered: DiscoveredDocument[] = [];
    let firstError = "";

    for (const file of files) {
      if (isStale(id)) return { discovered, firstError };
      try {
        const text = await file.text();
        if (isStale(id)) return { discovered, firstError };
        const fields = await options.runTypst(() => readSchema(text));
        if (isStale(id)) return { discovered, firstError };
        const entry = options.saveDiscovered(file.name, text, fields);
        discovered.push({ entry, fields });
      } catch (cause) {
        if (isStale(id)) return { discovered, firstError };
        if (!firstError) firstError = errorMessage(cause);
      }
    }

    return { discovered, firstError };
  };

  const handleFilesChange = async (event: FileChangeEvent) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    if (selected.length === 0) return;

    const files = [...new Map(selected.map((file) => [file.name, file] as const)).values()];
    const isBatch = files.length > 1;
    const id = beginOperation();
    if (isBatch) options.clearSelection();
    setFileName(isBatch ? `${files.length} files` : files[0].name);
    options.clearLibraryError();
    resetEditor();
    setDiscovering(true);

    try {
      const { discovered, firstError } = await discoverFiles(files, id);
      if (isStale(id)) return;

      if (isBatch) {
        resetEditor();
        setFileName("");
        if (firstError) setRenderError(firstError);
      } else {
        const active = discovered[0];
        if (active) {
          openDiscoveredFile(active);
          if (!firstError && active.fields.length === 0) {
            setSchemaNotice("No inputs discovered; rendering the document as-is.");
          }
        }
        if (firstError) setSchemaNotice(firstError);
      }
    } finally {
      if (!isStale(id)) {
        setDiscovering(false);
        if (!isBatch) void render();
      }
    }
  };

  return {
    fileName,
    fields,
    values,
    inputsValid,
    live,
    svg,
    renderError,
    schemaNotice,
    rendering,
    exporting,
    discovering,
    status,
    render,
    downloadPdf,
    setFieldValue,
    changeLive,
    openDocument,
    backToLibrary,
    handleFilesChange,
  };
}
