import type { DebateState, RoomState } from "@/app/types";

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

/**
 * Returns a single short label that summarizes both gates for a status
 * badge. While the room is `Deactivated` the leader's gate is irrelevant
 * and we surface only that; while `Active` we expose the debate gate
 * (`Running` / `Paused`) so users can tell whether the leader has stopped
 * the debate at a checkpoint.
 */
export function roomBadgeText(
  roomState: RoomState,
  debateState: DebateState,
): string {
  if (roomState === "deactivated") {
    return "Deactivated";
  }
  return debateState === "running" ? "Running" : "Paused";
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve): void => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
