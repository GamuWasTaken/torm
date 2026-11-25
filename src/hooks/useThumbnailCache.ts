import { createSignal, type Accessor } from "solid-js";
import type { LibraryEntry } from "../library";
import { initialValues } from "../schema";
import { renderTypst } from "../typst";
import { isSvg } from "../utils";
import type { TypstQueue } from "./useTypstQueue";

export function useThumbnailCache(
  library: Accessor<LibraryEntry[]>,
  queue: TypstQueue,
) {
  const [thumbnails, setThumbnails] = createSignal<Record<string, string>>({});
  let pending: string[] = [];
  let running = false;

  const removeThumbnail = (id: string) => {
    setThumbnails((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const getThumbnail = (id: string) => thumbnails()[id];

  const runQueue = async () => {
    if (running) return;
    running = true;
    try {
      while (pending.length > 0) {
        const id = pending.shift() ?? "";
        const entry = library().find((item) => item.id === id);
        if (!entry || thumbnails()[id]) continue;
        try {
          const result = await queue.run(() =>
            renderTypst(entry.source, initialValues(entry.fields)),
          );
          if (isSvg(result) && library().some((item) => item.id === id)) {
            setThumbnails((previous) => ({ ...previous, [id]: result }));
          }
        } catch {
          removeThumbnail(id);
        }
      }
    } finally {
      running = false;
    }
  };

  const queueThumbnail = (entry: LibraryEntry) => {
    if (thumbnails()[entry.id] || pending.includes(entry.id)) return;
    pending.push(entry.id);
    void runQueue();
  };

  for (const entry of library()) queueThumbnail(entry);

  return { thumbnails, getThumbnail, queueThumbnail, removeThumbnail };
}
