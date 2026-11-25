import { Show } from "solid-js";
import { EditorView } from "./components/EditorView";
import { LibraryView } from "./components/LibraryView";
import { useDocumentSession } from "./hooks/useDocumentSession";
import { useLibraryStore } from "./hooks/useLibraryStore";
import { useThumbnailCache } from "./hooks/useThumbnailCache";
import { useTypstQueue } from "./hooks/useTypstQueue";
import "./App.css";

function App() {
  const queue = useTypstQueue();
  const libraryStore = useLibraryStore();
  const thumbnails = useThumbnailCache(libraryStore.library, queue);
  const session = useDocumentSession({
    runTypst: queue.run,
    openEntry: libraryStore.selectEntry,
    clearSelection: libraryStore.clearSelection,
    saveDiscovered: (name, source, fields) => {
      const entry = libraryStore.saveEntry(name, source, fields);
      thumbnails.removeThumbnail(entry.id);
      thumbnails.queueThumbnail(entry);
      return entry;
    },
    selectDiscovered: libraryStore.selectEntry,
    clearLibraryError: libraryStore.clearLibraryError,
    getThumbnail: thumbnails.getThumbnail,
  });

  const removeSelected = () => {
    const id = libraryStore.selectedId();
    if (!id) return;
    libraryStore.removeEntry(id);
    thumbnails.removeThumbnail(id);
    session.backToLibrary();
  };

  return (
    <main class="app">
      <header class="header">
        <div>
          <h1>Typst SVG library</h1>
          <p class="subtitle">{libraryStore.library().length} saved document(s)</p>
        </div>
        <input
          type="file"
          accept=".typ,text/plain"
          multiple
          onChange={(event) => void session.handleFilesChange(event)}
          aria-label="Typst document"
        />
      </header>

      <Show when={libraryStore.libraryError()}>
        <p class="notice" role="alert">
          {libraryStore.libraryError()}
        </p>
      </Show>
      <Show when={session.renderError()}>
        <p class="error" role="alert">
          {session.renderError()}
        </p>
      </Show>

      <Show
        when={!libraryStore.selectedEntry()}
        fallback={
          <EditorView
            entryName={session.fileName}
            status={session.status}
            schemaNotice={session.schemaNotice}
            fields={session.fields}
            values={session.values}
            inputsValid={session.inputsValid}
            live={session.live}
            rendering={session.rendering}
            exporting={session.exporting}
            svg={session.svg}
            onBack={session.backToLibrary}
            onDelete={removeSelected}
            onFieldChange={session.setFieldValue}
            onToggleLive={session.changeLive}
            onRender={() => void session.render()}
            onDownloadPdf={() => void session.downloadPdf()}
          />
        }
      >
        <LibraryView
          entries={libraryStore.library}
          thumbnails={thumbnails.thumbnails}
          onOpen={session.openDocument}
        />
      </Show>
    </main>
  );
}

export default App;
