import { t } from "@excalidraw/excalidraw/i18n";
import { supabase } from "../data/supabase";
import type { UserRole, UserStatus } from "../data/UserManagementStore";
import type { Session } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  role: UserRole;
  status: UserStatus;
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

function getBlockedAccountMessage(status: UserStatus): string {
  return status === "banned"
    ? t("auth.errors.accountBanned")
    : t("auth.errors.accountDisabled");
}

async function loadProfile(
  userId: string,
  fallbackEmail: string | null,
  fallbackUsername: string | null,
  createdAtIso: string | null,
): Promise<AuthUser> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, created_at, updated_at, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load profile:", error.message);
  }

  const created = data?.created_at ?? createdAtIso ?? new Date().toISOString();
  const updated = data?.updated_at ?? created;

  return {
    id: userId,
    username: data?.username ?? fallbackUsername ?? fallbackEmail ?? "user",
    email: data?.email ?? fallbackEmail ?? "",
    createdAt: new Date(created).getTime(),
    updatedAt: new Date(updated).getTime(),
    role: data?.role ?? "user",
    status: data?.status ?? "active",
  };
}

async function applySession(session: Session | null): Promise<void> {
  if (!session?.user) {
    currentUser = null;
    emit();
    return;
  }

  const u = session.user;
  const profile = await loadProfile(
    u.id,
    u.email ?? null,
    (u.user_metadata?.username as string | undefined) ?? null,
    u.created_at ?? null,
  );

  if (profile.status !== "active") {
    currentUser = null;
    emit();
    await supabase.auth.signOut();
    throw new Error(getBlockedAccountMessage(profile.status));
  }

  currentUser = profile;
  emit();
}

function ensureHydrated(): Promise<void> {
  if (hydrated) {
    return Promise.resolve();
  }

  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
        supabase.auth.onAuthStateChange((_event, session) => {
          void applySession(session).catch((error) => {
            console.error("Auth session update failed:", error);
          });
        });
      } catch (error) {
        console.error("Auth hydration failed:", error);
        currentUser = null;
        emit();
      } finally {
        hydrated = true;
      }
    })();
  }

  return hydrationPromise;
}

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
      throw new Error(t("auth.errors.emailAlreadyRegistered"));
    }
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error(t("auth.errors.createAccountFailed"));
  }

  if (data.session) {
    await applySession(data.session);
  } else {
    const now = Date.now();
    currentUser = {
      id: data.user.id,
      username: trimmedUsername,
      email: trimmedEmail,
      createdAt: now,
      updatedAt: now,
      role: "user",
      status: "active",
    };
    emit();
  }

  if (!currentUser) {
    throw new Error(t("auth.errors.createdButLoginFailed"));
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
      throw new Error(t("auth.errors.invalidCredentials"));
    }
    throw new Error(error.message);
  }

  await applySession(data.session);
  if (!currentUser) {
    throw new Error(t("auth.errors.loginFailed"));
  }

  return currentUser;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error(t("auth.errors.emailRequired"));
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function beginPasswordRecoveryFromUrl(): Promise<boolean> {
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get("type") ?? queryParams.get("type");
  const code = queryParams.get("code") ?? hashParams.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (type !== "recovery" && !code) {
    return false;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw new Error(error.message);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(error.message);
    }
  } else {
    throw new Error(t("auth.errors.invalidRecoveryLink"));
  }

  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

export async function updatePassword(password: string): Promise<AuthUser> {
  if (password.length < 6) {
    throw new Error(t("auth.errors.passwordMinLength"));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw new Error(error.message);
  }

  const { data } = await supabase.auth.getSession();
  await applySession(data.session);

  if (!currentUser) {
    throw new Error(t("auth.errors.passwordUpdatedButLoginFailed"));
  }

  return currentUser;
}

export function logoutUser(): void {
  void supabase.auth.signOut().then(() => {
    currentUser = null;
    emit();
  });
}
