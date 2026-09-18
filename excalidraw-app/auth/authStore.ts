import { t } from "@excalidraw/excalidraw/i18n";

import { supabase } from "../data/supabase";
import { translateErrorMessage } from "../errorMessages";

import {
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validatePassword,
  validateUsername,
  validateRegistrationFields,
} from "./authValidation";
import {
  getPasswordResetRequestStartedAt,
  waitForPasswordResetResponseFloor,
} from "./passwordResetTiming";

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

export type RegisterUserResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "pendingVerification"; email: string };

export type AuthEmailFlowResult =
  | { type: "none" }
  | { type: "passwordRecovery" }
  | { type: "emailVerified"; user: AuthUser }
  | { type: "verificationExpired" }
  | { type: "verificationInvalid" }
  | { type: "emailAlreadyVerified" };

type Listener = (user: AuthUser | null) => void;

let currentUser: AuthUser | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
const EMAIL_VERIFICATION_RESEND_STORAGE_KEY =
  "excalidraw-email-verification-resend";

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

function getRegistrationErrorMessage(message: string): string {
  if (/registered|exists|duplicate/i.test(message)) {
    return t("auth.errors.emailAlreadyRegistered");
  }
  if (/database error saving new user/i.test(message)) {
    return t("auth.errors.createAccountProfileFailed");
  }
  return translateErrorMessage(message);
}

function getAuthRedirectTo(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function getEmailVerificationResendState(): Record<string, number> {
  try {
    return JSON.parse(
      localStorage.getItem(EMAIL_VERIFICATION_RESEND_STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function setEmailVerificationResendTimestamp(email: string): void {
  const state = getEmailVerificationResendState();
  state[normalizeEmail(email).toLowerCase()] = Date.now();
  localStorage.setItem(
    EMAIL_VERIFICATION_RESEND_STORAGE_KEY,
    JSON.stringify(state),
  );
}

export function getEmailVerificationResendWaitSeconds(email: string): number {
  const normalizedEmail = normalizeEmail(email).toLowerCase();
  const lastSentAt = getEmailVerificationResendState()[normalizedEmail] ?? 0;
  const remainingMs =
    EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);

  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

async function isEmailRegistered(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_email_registered", {
    p_email: email,
  });

  if (error) {
    console.warn("Failed to verify if email is registered:", error.message);
    return false;
  }

  return data === true;
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

export async function updateCurrentUsername(
  username: string,
): Promise<AuthUser> {
  await ensureHydrated();

  if (!currentUser) {
    throw new Error(t("auth.errors.loginFailed"));
  }

  const validationError = validateUsername(username);
  if (validationError) {
    throw new Error(t(validationError));
  }

  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername === currentUser.username) {
    return currentUser;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ username: normalizedUsername })
    .eq("id", currentUser.id)
    .select("id, username, email, created_at, updated_at, role, status")
    .single();

  if (error) {
    throw new Error(translateErrorMessage(error.message));
  }

  currentUser = {
    id: data.id,
    username: data.username,
    email: data.email,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime(),
    role: data.role,
    status: data.status,
  };
  emit();

  void supabase.auth
    .updateUser({ data: { username: normalizedUsername } })
    .catch((error) => {
      console.warn("Failed to sync auth metadata username:", error.message);
    });

  return currentUser;
}

export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<RegisterUserResult> {
  const validationError = validateRegistrationFields({
    username,
    email,
    password,
  });
  if (validationError) {
    throw new Error(t(validationError));
  }

  const trimmedUsername = normalizeUsername(username);
  const trimmedEmail = normalizeEmail(email);

  if (await isEmailRegistered(trimmedEmail)) {
    throw new Error(t("auth.errors.emailAlreadyRegistered"));
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: { username: trimmedUsername },
      emailRedirectTo: getAuthRedirectTo(),
    },
  });

  if (error) {
    throw new Error(getRegistrationErrorMessage(error.message));
  }

  if (!data.user) {
    throw new Error(t("auth.errors.createAccountFailed"));
  }

  if (data.session) {
    await applySession(data.session);
    if (!currentUser) {
      throw new Error(t("auth.errors.createdButLoginFailed"));
    }
    return { status: "authenticated", user: currentUser };
  }
  currentUser = null;
  emit();
  setEmailVerificationResendTimestamp(trimmedEmail);
  return { status: "pendingVerification", email: trimmedEmail };
}

export async function resendEmailVerification(email: string): Promise<void> {
  const validationError = validateEmail(email);
  if (validationError) {
    throw new Error(t(validationError));
  }

  const trimmedEmail = normalizeEmail(email);
  const waitSeconds = getEmailVerificationResendWaitSeconds(trimmedEmail);
  if (waitSeconds > 0) {
    throw new Error(
      t("auth.errors.verificationResendTooSoon", {
        seconds: waitSeconds,
      }),
    );
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmedEmail,
    options: {
      emailRedirectTo: getAuthRedirectTo(),
    },
  });

  if (error) {
    throw new Error(translateErrorMessage(error.message));
  }

  setEmailVerificationResendTimestamp(trimmedEmail);
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
    if (/email not confirmed|not confirmed/i.test(error.message)) {
      throw new Error(t("auth.errors.emailNotVerified"));
    }
    if (/invalid login|invalid credentials/i.test(error.message)) {
      throw new Error(t("auth.errors.invalidCredentials"));
    }
    throw new Error(translateErrorMessage(error.message));
  }

  await applySession(data.session);
  if (!currentUser) {
    throw new Error(t("auth.errors.loginFailed"));
  }

  return currentUser;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const validationError = validateEmail(email);
  if (validationError) {
    throw new Error(t(validationError));
  }

  const startedAt = getPasswordResetRequestStartedAt();
  try {
    const trimmedEmail = normalizeEmail(email);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });

    if (error) {
      console.warn("Password reset request failed:", error.message);
    }
  } catch (error) {
    console.warn("Password reset request failed:", error);
  } finally {
    await waitForPasswordResetResponseFloor(startedAt);
  }
}

const clearAuthUrlParams = (): void => {
  window.history.replaceState({}, "", window.location.pathname);
};

export async function beginAuthEmailFlowFromUrl(): Promise<AuthEmailFlowResult> {
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const queryParams = new URLSearchParams(window.location.search);
  const getParam = (name: string) =>
    hashParams.get(name) ?? queryParams.get(name);
  const type = getParam("type");
  const error = getParam("error");
  const errorCode = getParam("error_code");
  const errorDescription = getParam("error_description");
  const code = queryParams.get("code") ?? hashParams.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (error || errorCode || errorDescription) {
    const authError = [error, errorCode, errorDescription].join(" ");
    clearAuthUrlParams();

    if (
      /already.*(verified|confirmed)|user.*already.*confirmed/i.test(authError)
    ) {
      return { type: "emailAlreadyVerified" };
    }
    if (/expired|otp_expired/i.test(authError)) {
      return { type: "verificationExpired" };
    }
    if (/invalid|access_denied|token/i.test(authError)) {
      return { type: "verificationInvalid" };
    }

    throw new Error(translateErrorMessage(authError));
  }

  if (type !== "recovery" && type !== "signup" && !code) {
    return { type: "none" };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw new Error(translateErrorMessage(error.message));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(translateErrorMessage(error.message));
    }
  } else {
    throw new Error(
      type === "signup"
        ? t("auth.errors.verificationLinkInvalid")
        : t("auth.errors.invalidRecoveryLink"),
    );
  }

  clearAuthUrlParams();

  if (type === "signup") {
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);

    if (!currentUser) {
      throw new Error(t("auth.errors.loginFailed"));
    }

    return { type: "emailVerified", user: currentUser };
  }

  return { type: "passwordRecovery" };
}

export async function beginPasswordRecoveryFromUrl(): Promise<boolean> {
  const result = await beginAuthEmailFlowFromUrl();
  return result.type === "passwordRecovery";
}

export async function updatePassword(password: string): Promise<AuthUser> {
  const validationError = validatePassword(password);
  if (validationError) {
    throw new Error(t(validationError));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw new Error(translateErrorMessage(error.message));
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
