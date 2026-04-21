import type { DashboardStore } from "@/app/state";
import { type Context, createContext } from "@lit/context";

export const dashboardContext: Context<unknown, DashboardStore> = createContext<
  DashboardStore
>("dashboard-context");
