import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_APP_SUPABASE_URL;
const anonKey = import.meta.env.VITE_APP_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars missing: VITE_APP_SUPABASE_URL / VITE_APP_SUPABASE_ANON_KEY",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "excalidraw-supabase-auth",
  },
});
