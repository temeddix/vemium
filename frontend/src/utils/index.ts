export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve): void => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

/**
 * Moves the single-page app to `path`. The router listens for `popstate`
 * on the window, which `pushState` alone does not fire.
 */
export function navigateTo(path: string): void {
  globalThis.history.pushState({}, "", path);
  globalThis.dispatchEvent(new PopStateEvent("popstate"));
}
