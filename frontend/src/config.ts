export const BACKEND_BASE_URL: string =
  globalThis.location?.origin.includes("localhost")
    ? "http://localhost:8080"
    : "http://backend:8080";

export const RECONNECT_DELAYS_MS: number[] = [500, 1000, 2000, 4000, 8000];
