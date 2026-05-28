import type { Session } from "@supabase/supabase-js";

import { supabase } from "../data/supabase";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  createdAt: number;
}

type Listener = (user: AuthUser | null) => void;

let currentUser: AuthUser | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    l(currentUser);
  }
}

async function loadProfile(
  userId: string,
  fallbackEmail: string | null,
  fallbackUsername: string | null,
  createdAtIso: string | null,
): Promise<AuthUser> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to load profile:", error.message);
  }

  const created = data?.created_at ?? createdAtIso ?? new Date().toISOString();
  return {
    id: userId,
    username: data?.username ?? fallbackUsername ?? fallbackEmail ?? "user",
    email: data?.email ?? fallbackEmail ?? "",
    createdAt: new Date(created).getTime(),
  };
}

async function applySession(session: Session | null): Promise<void> {
  if (!session?.user) {
    currentUser = null;
    emit();
    return;
  }
  const u = session.user;
  currentUser = await loadProfile(
    u.id,
    u.email ?? null,
    (u.user_metadata?.username as string | undefined) ?? null,
    u.created_at ?? null,
  );
  emit();
}

function ensureHydrated(): Promise<void> {
  if (hydrated) {
    return Promise.resolve();
  }
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
      supabase.auth.onAuthStateChange((_event, session) => {
        void applySession(session);
      });
      hydrated = true;
    })();
  }
  return hydrationPromise;
}

// Kick off hydration on module load so getCurrentUser() returns the right value
// shortly after startup.
void ensureHydrated();

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

export function isAuthHydrated(): boolean {
  return hydrated;
}

export function waitForAuthHydration(): Promise<void> {
  return ensureHydrated();
}

export function subscribeToAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: { data: { username: trimmedUsername } },
  });

  if (error) {
    if (/registered|exists|duplicate/i.test(error.message)) {
      throw new Error("Ya existe una cuenta con ese correo electrónico.");
    }
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error(
      "No se pudo crear la cuenta. Revisa la configuración de Supabase.",
    );
  }

  // The DB trigger creates the profile row. Hydrate from session if present
  // (when email confirmation is disabled), otherwise build from signup data.
  if (data.session) {
    await applySession(data.session);
  } else {
    currentUser = {
      id: data.user.id,
      username: trimmedUsername,
      email: trimmedEmail,
      createdAt: Date.now(),
    };
    emit();
  }
  if (!currentUser) {
    throw new Error("Cuenta creada pero no se pudo iniciar sesión.");
  }
  return currentUser;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    if (/invalid login|invalid credentials/i.test(error.message)) {
      throw new Error("Correo o contraseña incorrectos.");
    }
    throw new Error(error.message);
  }

  await applySession(data.session);
  if (!currentUser) {
    throw new Error("No se pudo iniciar sesión.");
  }
  return currentUser;
}

export function logoutUser(): void {
  void supabase.auth.signOut().then(() => {
    currentUser = null;
    emit();
  });
}
