const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
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
    },
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

  beforeAll(async () => {
    ({ requestPasswordReset } = await import("../auth/authStore"));
  });

  beforeEach(() => {
    supabaseMocks.resetPasswordForEmail.mockReset();
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
});
