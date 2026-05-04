/**
 * Chat-rendering helpers shared by the message bubble and the page that
 * lays bubbles out (avatar grouping, time-gap separators, persona color
 * assignment).
 *
 * The color assignment is deterministic: the same agent name always maps
 * to the same palette slot so a persona keeps its identity across rooms,
 * across reloads, and even after server-side renames.
 */

import type { TurnKind } from "@/app/types";

/** Stable string the backend writes into `agent` for human-authored rows. */
export const USER_AGENT_NAME = "user";

/** Time gap (ms) at or above which the chat shows a centered timestamp. */
export const TIME_GAP_THRESHOLD_MS = 5 * 60 * 1000;

export interface PersonaColor {
  /** Background fill for the avatar circle. */
  background: string;
  /** Text/icon color drawn on top of the background. */
  foreground: string;
}

/**
 * Eight-slot palette tuned for the dark Web Awesome theme. Each entry has
 * enough contrast against `--wa-color-surface-default` to read as a
 * distinct identity at the small avatar size used in the chat.
 */
const PALETTE: PersonaColor[] = [
  { background: "#e85d75", foreground: "#ffffff" }, // rose
  { background: "#f08a3e", foreground: "#1f1208" }, // orange
  { background: "#e7c14b", foreground: "#1f1a08" }, // amber
  { background: "#5cb85c", foreground: "#0a1f0a" }, // green
  { background: "#3aa6a0", foreground: "#06201f" }, // teal
  { background: "#5aa9e6", foreground: "#03162a" }, // sky
  { background: "#8a7df7", foreground: "#ffffff" }, // indigo
  { background: "#c879d8", foreground: "#1d0a23" }, // violet
];

/** Brand color used for the human operator's own messages. */
const SELF_COLOR: PersonaColor = {
  background: "var(--wa-color-brand-fill-loud)",
  foreground: "var(--wa-color-brand-on-loud)",
};

/**
 * Resolves the avatar color for one chat row. `user_chat` always returns
 * the brand color so the human's identity is never mistaken for an AI
 * persona, even if some persona happened to be named "user".
 */
export function resolveAvatarColor(
  kind: TurnKind,
  agent: string | null,
): PersonaColor {
  if (kind === "user_chat") {
    return SELF_COLOR;
  }
  const key = agent ?? "";
  if (key === "") {
    return PALETTE[0];
  }
  return PALETTE[hashToIndex(key, PALETTE.length)];
}

/**
 * Initial(s) shown inside an avatar circle. One letter for single-word
 * names, two for multi-word names ("Data Scavenger" -> "DS"). Always
 * upper-case ASCII so the small render stays legible.
 */
export function avatarInitials(kind: TurnKind, agent: string | null): string {
  if (kind === "user_chat") {
    return "ME";
  }
  const source = (agent ?? "?").trim();
  if (source === "") {
    return "?";
  }
  const words = source.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Returns true when the chat should insert a centered timestamp separator
 * between `previous` and `current`. First message always gets one; later
 * separators only appear when the gap exceeds [`TIME_GAP_THRESHOLD_MS`].
 */
export function shouldShowTimeSeparator(
  previousTimestamp: string | null,
  currentTimestamp: string,
): boolean {
  if (previousTimestamp === null) {
    return true;
  }
  const previous = Date.parse(previousTimestamp);
  const current = Date.parse(currentTimestamp);
  if (Number.isNaN(previous) || Number.isNaN(current)) {
    return false;
  }
  return current - previous >= TIME_GAP_THRESHOLD_MS;
}

/**
 * Returns true when `current` is the last bubble in a run of consecutive
 * messages from the same speaker. The chat shows the avatar only on the
 * last bubble of a run (Instagram-style grouping), so this predicate
 * gates avatar rendering.
 */
export function isLastInRun(
  current: { kind: TurnKind; agent: string | null },
  next: { kind: TurnKind; agent: string | null } | null,
): boolean {
  if (next === null) {
    return true;
  }
  return current.kind !== next.kind || current.agent !== next.agent;
}

/**
 * Formats a timestamp the way the centered separator displays it. We keep
 * the date out unless the message is from a different day than "now",
 * matching how Instagram/KakaoTalk lay out their separators.
 */
export function formatSeparatorTimestamp(timestamp: string): string {
  const when = new Date(timestamp);
  const now = new Date();
  const sameDay = when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate();
  if (sameDay) {
    return when.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return when.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Tiny djb2 string hash, mapped into `[0, modulus)`. Only used for picking
 * a palette slot; collisions are fine because two personas with the same
 * color is purely cosmetic.
 */
function hashToIndex(value: string, modulus: number): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulus;
}
