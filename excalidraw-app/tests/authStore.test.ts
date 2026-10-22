const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
}));

const timingMocks = vi.hoisted(() => ({
  getPasswordResetRequestStartedAt: vi.fn(() => 0),
  waitForPasswordResetResponseFloor: vi.fn(() => Promise.resolve()),
}));

vi.mock("@excalidraw/excalidraw/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../data/supabase", () => ({
  supabase: {
    auth: {
      getSession: supabaseMocks.getSession,
      onAuthStateChange: supabaseMocks.onAuthStateChange,
      signOut: supabaseMocks.signOut,
      updateUser: supabaseMocks.updateUser,
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      signUp: supabaseMocks.signUp,
      resend: supabaseMocks.resend,
      verifyOtp: supabaseMocks.verifyOtp,
    },
    rpc: supabaseMocks.rpc,
  },
}));

vi.mock("../auth/passwordResetTiming", () => ({
  getPasswordResetRequestStartedAt:
    timingMocks.getPasswordResetRequestStartedAt,
  waitForPasswordResetResponseFloor:
    timingMocks.waitForPasswordResetResponseFloor,
}));

describe("auth store password reset", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  let beginAuthEmailFlowFromUrl: () => Promise<unknown>;
  let requestPasswordReset: (email: string) => Promise<void>;
  let registerUser: (
    username: string,
    email: string,
    password: string,
  ) => Promise<unknown>;
  let getPasswordResetResendWaitSeconds: (email: string) => number;
  let resendEmailVerification: (email: string) => Promise<void>;

  beforeAll(async () => {
    ({
      beginAuthEmailFlowFromUrl,
      getPasswordResetResendWaitSeconds,
      requestPasswordReset,
      registerUser,
      resendEmailVerification,
    } = await import("../auth/authStore"));
  });

  beforeEach(() => {
    supabaseMocks.resetPasswordForEmail.mockReset();
    supabaseMocks.signUp.mockReset();
    supabaseMocks.resend.mockReset();
    supabaseMocks.verifyOtp.mockReset();
    supabaseMocks.rpc.mockReset();
    supabaseMocks.rpc.mockResolvedValue({ data: false, error: null });
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    timingMocks.getPasswordResetRequestStartedAt.mockClear();
    timingMocks.waitForPasswordResetResponseFloor.mockClear();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("does not expose password reset provider errors for valid emails", async () => {
    supabaseMocks.resetPasswordForEmail.mockResolvedValueOnce({
      error: new Error("Error sending recovery email"),
    });

    await expect(
      requestPasswordReset("registered@example.com"),
    ).resolves.toBeUndefined();

    expect(supabaseMocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(timingMocks.waitForPasswordResetResponseFloor).toHaveBeenCalledTimes(
      1,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "Password reset request failed:",
      "Error sending recovery email",
    );
  });

  it("throttles repeated password reset emails", async () => {
    supabaseMocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null });

    await expect(
      requestPasswordReset("registered@example.com"),
    ).resolves.toBeUndefined();

    expect(
      getPasswordResetResendWaitSeconds("registered@example.com"),
    ).toBeGreaterThan(0);
    await expect(
      requestPasswordReset("registered@example.com"),
    ).rejects.toThrow("auth.errors.passwordResetResendTooSoon");
    expect(supabaseMocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(timingMocks.waitForPasswordResetResponseFloor).toHaveBeenCalledTimes(
      1,
    );
  });

  it("rejects invalid emails before calling reset or waiting", async () => {
    await expect(requestPasswordReset("")).rejects.toThrow(
      "auth.errors.emailRequired",
    );

    expect(supabaseMocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(
      timingMocks.waitForPasswordResetResponseFloor,
    ).not.toHaveBeenCalled();
  });

  it("accepts direct recovery token hash links", async () => {
    window.history.replaceState(
      {},
      "",
      "/?type=recovery&token_hash=recovery-hash",
    );
    supabaseMocks.verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: "token" }, user: { id: "user-1" } },
      error: null,
    });

    await expect(beginAuthEmailFlowFromUrl()).resolves.toEqual({
      type: "passwordRecovery",
    });

    expect(supabaseMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-hash",
      type: "recovery",
    });
    expect(window.location.search).toBe("");
  });

  it("drops another user's session when a recovery link is opened", async () => {
    window.history.replaceState(
      {},
      "",
      "/?type=recovery&token_hash=recovery-hash",
    );
    supabaseMocks.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: "user-b" } } },
    } as any);
    vi.resetModules();
    const store = await import("../auth/authStore");

    await store.waitForAuthHydration();

    expect(supabaseMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(store.getCurrentUser()).toBeNull();
  });

  it("ends the account's other sessions after changing the password", async () => {
    supabaseMocks.updateUser.mockResolvedValueOnce({ error: null });
    supabaseMocks.signOut.mockClear();
    const store = await import("../auth/authStore");

    // no session comes back in this mock, so the final sign-in step fails
    await expect(store.updatePassword("Password1!")).rejects.toThrow();

    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      password: "Password1!",
    });
    expect(supabaseMocks.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("rejects registered emails before calling signup", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({ data: true, error: null });

    await expect(
      registerUser("Paloma", "paloma@example.com", "Password1!"),
    ).rejects.toThrow("auth.errors.emailAlreadyRegistered");

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("is_email_registered", {
      p_email: "paloma@example.com",
    });
    expect(supabaseMocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects taken usernames before calling signup", async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(
      registerUser("Paloma", "nueva@example.com", "Password1!"),
    ).rejects.toThrow("auth.errors.usernameAlreadyRegistered");

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("is_username_registered", {
      p_username: "Paloma",
    });
    expect(supabaseMocks.signUp).not.toHaveBeenCalled();
  });

  it("keeps new signups pending until email verification", async () => {
    supabaseMocks.signUp.mockResolvedValueOnce({
      data: {
        user: { id: "user-1", email: "paloma@example.com" },
        session: null,
      },
      error: null,
    });

    await expect(
      registerUser("Paloma", "paloma@example.com", "Password1!"),
    ).resolves.toEqual({
      status: "pendingVerification",
      email: "paloma@example.com",
    });

    expect(supabaseMocks.signUp).toHaveBeenCalledWith({
      email: "paloma@example.com",
      password: "Password1!",
      options: {
        data: { username: "Paloma" },
        emailRedirectTo: "http://localhost:3000/",
      },
    });
  });

  it("keeps signups pending when auth-js returns no user nor session", async () => {
    supabaseMocks.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: null,
    });

    await expect(
      registerUser("Paloma", "paloma@example.com", "Password1!"),
    ).resolves.toEqual({
      status: "pendingVerification",
      email: "paloma@example.com",
    });
  });

  it("shows an actionable registration message for generic provider database errors", async () => {
    supabaseMocks.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error("Database error saving new user"),
    });

    await expect(
      registerUser("Paloma", "paloma@example.com", "Password1!"),
    ).rejects.toThrow("auth.errors.createAccountProfileFailed");

    expect(supabaseMocks.signUp).toHaveBeenCalledWith({
      email: "paloma@example.com",
      password: "Password1!",
      options: {
        data: { username: "Paloma" },
        emailRedirectTo: "http://localhost:3000/",
      },
    });
  });

  it("resends verification emails and throttles repeated requests", async () => {
    supabaseMocks.resend.mockResolvedValueOnce({ data: {}, error: null });

    await expect(
      resendEmailVerification("paloma@example.com"),
    ).resolves.toBeUndefined();

    expect(supabaseMocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "paloma@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/",
      },
    });

    await expect(resendEmailVerification("paloma@example.com")).rejects.toThrow(
      "auth.errors.verificationResendTooSoon",
    );
    expect(supabaseMocks.resend).toHaveBeenCalledTimes(1);
  });
});
