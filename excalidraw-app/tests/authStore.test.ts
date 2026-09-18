const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
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
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      signUp: supabaseMocks.signUp,
      resend: supabaseMocks.resend,
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
  let requestPasswordReset: (email: string) => Promise<void>;
  let registerUser: (
    username: string,
    email: string,
    password: string,
  ) => Promise<unknown>;
  let resendEmailVerification: (email: string) => Promise<void>;

  beforeAll(async () => {
    ({ requestPasswordReset, registerUser, resendEmailVerification } =
      await import("../auth/authStore"));
  });

  beforeEach(() => {
    supabaseMocks.resetPasswordForEmail.mockReset();
    supabaseMocks.signUp.mockReset();
    supabaseMocks.resend.mockReset();
    supabaseMocks.rpc.mockReset();
    supabaseMocks.rpc.mockResolvedValue({ data: false, error: null });
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

  it("rejects invalid emails before calling reset or waiting", async () => {
    await expect(requestPasswordReset("")).rejects.toThrow(
      "auth.errors.emailRequired",
    );

    expect(supabaseMocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(
      timingMocks.waitForPasswordResetResponseFloor,
    ).not.toHaveBeenCalled();
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
