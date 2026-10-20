import { type Context, createContext } from "@lit/context";

import type { DashboardStore } from "#state";

export const dashboardContext: Context<unknown, DashboardStore> =
  createContext<DashboardStore>(Symbol("dashboard-context"));
