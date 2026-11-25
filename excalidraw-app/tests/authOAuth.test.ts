import type * as AuthStore from "../auth/authStore";

const mocks = vi.hoisted(() => ({
  status: "active",
  enabled: true,
  setSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock("@excalidraw/excalidraw/i18n", () => ({ t: (key: string) => key }));

vi.mock("../errorMessages", () => ({
  translateErrorMessage: (message: string) => message,
  getErrorMessage: (error: Error) => error.message,
}));

vi.mock("../data/supabase", () => ({
  supabaseUrl: "http://localhost/",
  anonKey: "anon",
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
      setSession: mocks.setSession,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { username: "sara", status: mocks.status },
          error: null,
        }),
      };
      return builder;
    },
  },
}));

const SHARED_LINK = "/#room=abc123,key456";
const TOKENS = "#access_token=token&refresh_token=refresh&token_type=bearer";
const currentPath = () =>
  window.location.pathname + window.location.search + window.location.hash;

describe("sign in with Discord", () => {
  let store: typeof AuthStore;

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    mocks.status = "active";
    mocks.signOut.mockClear();
    mocks.signInWithOAuth.mockReset();
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.setSession.mockReset();
    mocks.setSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
            email: "sara@example.com",
            app_metadata: { providers: ["discord"] },
          },
        },
      },
      error: null,
    });
    vi.stubGlobal("fetch", async () => ({
      json: async () => ({ external: { discord: mocks.enabled } }),
    }));
    mocks.enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    store = await import("../auth/authStore");
    await store.waitForAuthHydration();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  const leaveFrom = async (path: string) => {
    window.history.replaceState({}, "", path);
    await store.signInWithProvider("discord");
  };

  const comeBackTo = (path: string) => {
    window.history.replaceState({}, "", path);
    return store.beginAuthEmailFlowFromUrl();
  };

  it("stays in the app when the provider is turned off", async () => {
    mocks.enabled = false;
    await expect(store.signInWithProvider("discord")).rejects.toThrow(
      "auth.errors.oauthUnavailable",
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("doesn't send the room key of the shared link to the server", async () => {
    await leaveFrom(SHARED_LINK);
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/`,
        scopes: undefined,
      },
    });
  });

  it("signs in and goes back to the shared link", async () => {
    await leaveFrom(SHARED_LINK);
    await expect(comeBackTo(`/${TOKENS}`)).resolves.toMatchObject({
      type: "oauthSignedIn",
      user: { id: "user-1", hasPassword: false },
    });
    expect(currentPath()).toBe(SHARED_LINK);
  });

  it("keeps the shared link when the user cancels", async () => {
    await leaveFrom(SHARED_LINK);
    await expect(
      comeBackTo("/?error=access_denied#error=access_denied&sb="),
    ).resolves.toEqual({
      type: "oauthFailed",
      message: "auth.errors.oauthCancelled",
    });
    expect(currentPath()).toBe(SHARED_LINK);
  });

  it.each([
    [
      "error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email+from+external+provider",
      "auth.errors.oauthEmailRequired",
    ],
    [
      "error=access_denied&error_code=provider_email_needs_verification&error_description=Unverified+email+with+discord",
      "auth.messages.verificationEmailSent",
    ],
    [
      "error=access_denied&error_code=user_banned&error_description=User+is+banned",
      "auth.errors.accountBanned",
    ],
    [
      "error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code",
      "auth.errors.loginFailed",
    ],
    [
      "error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed",
      "auth.errors.loginFailed",
    ],
  ])("explains %s", async (params, message) => {
    await leaveFrom("/");
    await expect(comeBackTo(`/?${params}`)).resolves.toEqual({
      type: "oauthFailed",
      message,
    });
  });

  it("recognizes an expired sign-in without the stored return", async () => {
    await expect(
      comeBackTo("/?error=invalid_request&error_code=bad_oauth_state"),
    ).resolves.toMatchObject({ type: "oauthFailed" });
    expect(currentPath()).toBe("/");
  });

  it("rejects banned accounts and removes the tokens from the URL", async () => {
    mocks.status = "banned";
    await leaveFrom("/");
    await expect(comeBackTo(`/${TOKENS}`)).resolves.toEqual({
      type: "oauthFailed",
      message: "auth.errors.accountBanned",
    });
    expect(mocks.signOut).toHaveBeenCalled();
    expect(store.getCurrentUser()).toBeNull();
    expect(currentPath()).toBe("/");
  });

  it("still reports expired email links as such", async () => {
    await expect(
      comeBackTo("/?error=access_denied&error_code=otp_expired"),
    ).resolves.toEqual({ type: "verificationExpired" });
  });
});
