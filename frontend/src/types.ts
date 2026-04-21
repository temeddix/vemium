export type RunKind = "discussion";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  kind: RunKind;
  status: RunStatus;
  topic: string;
  goal: string;
  instruction: string | null;
  background: string | null;
  intervalSeconds: number;
  rounds: number;
  runForever: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunResponse {
  run: RunRecord;
}

export interface ActiveRunResponse {
  run: RunRecord | null;
}

export interface RunsResponse {
  runs: RunRecord[];
}

export interface StartRunRequest {
  topic?: string;
  goal?: string;
  instruction?: string;
  background?: string;
  intervalSeconds?: number;
  rounds?: number;
  runForever?: boolean;
}

export interface RunSettings {
  kind: RunKind;
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  intervalMinutes: number;
  turns: number;
  autorun: boolean;
  updatedAt: string;
}

export interface RunSettingsResponse {
  settings: RunSettings[];
}

export interface SaveRunSettingsRequest {
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  intervalMinutes: number;
  turns: number;
  autorun: boolean;
}

export interface SaveRunSettingsResponse {
  setting: RunSettings;
}

export interface RunEvent {
  runId: string;
  sequence: number;
  eventType: string;
  agent: string | null;
  content: string;
  timestamp: string;
}

export interface DashboardState {
  activeRun: RunRecord | null;
  runs: RunRecord[];
  events: RunEvent[];
  wsConnected: boolean;
  reconnectAttempt: number;
  isStartingRun: boolean;
  errorMessage: string | null;
}
