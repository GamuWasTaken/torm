import type { FormField } from "./schema";

export interface LibraryEntry {
  id: string;
  name: string;
  source: string;
  fields: FormField[];
}

const LIBRARY_KEY = "project-torm:library:v1";

function isValidEntry(value: unknown): value is LibraryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<LibraryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.source === "string" &&
    Array.isArray(entry.fields)
  );
}

function readStoredLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

export function loadLibrary(): LibraryEntry[] {
  return readStoredLibrary();
}

export function saveLibrary(entries: LibraryEntry[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
