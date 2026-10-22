import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_APP_SUPABASE_URL;
export const anonKey = import.meta.env.VITE_APP_SUPABASE_ANON_KEY;
export const supabaseUrl =
  url && url.startsWith("/")
    ? new URL(url, window.location.origin).toString()
    : url;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars missing: VITE_APP_SUPABASE_URL / VITE_APP_SUPABASE_ANON_KEY",
  );
}

// On phones a request in flight when the connection drops can stay pending
// for minutes, leaving loaders ("Abriendo tablero…") spinning after the
// network is back. Bound every API call; uploads/downloads of board files get
// more time since they can be large.
const REQUEST_TIMEOUT_MS = 20_000;
const STORAGE_REQUEST_TIMEOUT_MS = 120_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
  const timeoutMs = url.includes("/storage/v1/")
    ? STORAGE_REQUEST_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener(
        "abort",
        () => controller.abort(callerSignal.reason),
        { once: true },
      );
    }
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
};

export const supabase = createClient(supabaseUrl ?? "", anonKey ?? "", {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "excalidraw-supabase-auth",
  },
});
