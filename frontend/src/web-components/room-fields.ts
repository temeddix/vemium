/**
 * The labels and help texts of the room fields, shared by the dialogs that
 * create a room and edit one.
 *
 * @module
 */

import type { FieldSpec } from "./form-fields.ts";

export const TOPIC_FIELD: FieldSpec = {
  key: "topic",
  label: "Topic",
  tooltip:
    "Short subject the debaters argue about. Shown to every persona at the top of every turn and used as the room's display label.",
};

export const GOAL_FIELD: FieldSpec = {
  key: "goal",
  label: "Goal",
  tooltip:
    "What you want the room to produce. Used by the leader to judge whether the discussion is on track.",
};

export const INSTRUCTION_FIELD: FieldSpec = {
  key: "instruction",
  label: "Instruction",
  tooltip:
    "Optional. Rules personas must follow plus any background context to treat as already-known facts. Appended to every persona prompt.",
};

export const WAKE_CHECK_FIELD: FieldSpec = {
  key: "wake-check",
  label: "Wake-check schedule",
  tooltip:
    "Times are interpreted in UTC. While the room is paused, the leader checks at this cadence whether to resume the debate.",
};

export const REPORT_FIELD: FieldSpec = {
  key: "report",
  label: "Report schedule",
  tooltip:
    "Times are interpreted in UTC. The leader writes a long-form report on each firing of this schedule.",
};

export const CHAT_INTERVAL_FIELD: FieldSpec = {
  key: "chat-interval",
  label: "Chat interval",
  tooltip:
    "Pause between consecutive debater turns, in seconds. Lower = faster cadence, higher token spend.",
};

export const STEERING_INTERVAL_FIELD: FieldSpec = {
  key: "steering-interval",
  label: "Steering interval",
  tooltip:
    "How often the leader steps in to nudge the debate, in seconds. Higher = more autonomy for personas.",
};

export const PYTHON_TIMEOUT_FIELD: FieldSpec = {
  key: "python-timeout",
  label: "Python timeout",
  tooltip:
    "Hard cap for a single Python script run, in seconds. Scripts that exceed this are killed.",
};
