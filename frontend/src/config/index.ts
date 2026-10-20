const LOCATION_ORIGIN = globalThis.location?.origin;

export const BACKEND_BASE_URL: string =
  LOCATION_ORIGIN !== undefined && LOCATION_ORIGIN.length > 0
    ? LOCATION_ORIGIN
    : "http://backend:8080";

export const RECONNECT_DELAYS_MS: number[] = [500, 1000, 2000, 4000, 8000];
