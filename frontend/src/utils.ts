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

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve): void => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
