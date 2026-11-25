import type { FormField } from "./form";

export interface LibraryEntry {
  id: string;
  name: string;
  source: string;
  fields: FormField[];
  updatedAt: number;
}

const LIBRARY_KEY = "project-torm:library:v1";

export function loadLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LibraryEntry => {
      if (typeof item !== "object" || item === null) return false;
      const entry = item as Partial<LibraryEntry>;
      return (
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.source === "string" &&
        Array.isArray(entry.fields)
      );
    });
  } catch {
    return [];
  }
}

export function saveLibrary(entries: LibraryEntry[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
