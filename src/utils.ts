export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function isSvg(value: string | undefined): value is string {
  return typeof value === "string" && value.includes("<svg");
}

export function statusLabel(state: {
  discovering: boolean;
  rendering: boolean;
  fileName: string;
}): string {
  if (state.discovering) return `Reading ${state.fileName}...`;
  if (state.rendering) return `Rendering ${state.fileName}...`;
  return `Editing ${state.fileName}`;
}
