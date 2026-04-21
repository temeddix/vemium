export type RunKind = "discussion" | "weekly_report";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  kind: RunKind;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunResponse {
  run: RunRecord;
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
  events: RunEvent[];
  wsConnected: boolean;
  reconnectAttempt: number;
  isStartingRun: boolean;
  errorMessage: string | null;
}
