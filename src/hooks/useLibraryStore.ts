import { createEffect, createSignal } from "solid-js";
import { loadLibrary, makeId, saveLibrary, type LibraryEntry } from "../library";
import type { FormField } from "../schema";

export function useLibraryStore() {
  const [library, setLibrary] = createSignal<LibraryEntry[]>(loadLibrary());
  const [selectedId, setSelectedId] = createSignal("");
  const [libraryError, setLibraryError] = createSignal("");

  const selectedEntry = () => library().find((entry) => entry.id === selectedId());

  createEffect(() => {
    try {
      saveLibrary(library());
    } catch {
      setLibraryError("Browser storage is full; recent documents may not persist.");
    }
  });

  const clearLibraryError = () => setLibraryError("");

  const saveEntry = (
    name: string,
    source: string,
    fields: FormField[],
  ): LibraryEntry => {
    const existing = library().find((entry) => entry.name === name);
    const entry: LibraryEntry = {
      id: existing?.id ?? makeId(),
      name,
      source,
      fields,
    };
    setLibrary((previous) => [entry, ...previous.filter((item) => item.id !== entry.id)]);
    return entry;
  };

  const selectEntry = (id: string) => setSelectedId(id);

  const clearSelection = () => setSelectedId("");

  const removeEntry = (id: string) => {
    setLibrary((previous) => previous.filter((entry) => entry.id !== id));
  };

  return {
    library,
    selectedId,
    selectedEntry,
    libraryError,
    clearLibraryError,
    saveEntry,
    selectEntry,
    clearSelection,
    removeEntry,
  };
}
