import type { RoomStatus } from "@/app/types";

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

export function roomStatusToText(status: RoomStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "failed":
      return "Failed";
  }
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve): void => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
