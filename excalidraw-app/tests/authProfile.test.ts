const mocks = vi.hoisted(() => {
  const row: Record<string, unknown> = {};
  const session = {
    user: {
      id: "user-1",
      email: "sara@example.com",
      app_metadata: { providers: ["email"] } as Record<string, unknown>,
      user_metadata: {},
    },
  };
  return {
    row,
    session,
    updates: [] as Array<Record<string, unknown>>,
    updateError: null as { message: string } | null,
    getSession: vi.fn(() => Promise.resolve({ data: { session } })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    updateUser: vi.fn((_attributes: Record<string, unknown>) =>
      Promise.resolve({ error: null }),
    ),
    signInWithPassword: vi.fn(),
  };
});

vi.mock("@excalidraw/excalidraw/i18n", () => ({ t: (key: string) => key }));

vi.mock("../errorMessages", () => ({
  translateErrorMessage: (message: string) => message,
}));

vi.mock("../data/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (changes: Record<string, unknown>) => {
          mocks.updates.push(changes);
          if (!mocks.updateError) {
            Object.assign(mocks.row, changes);
          }
          return builder;
        },
        maybeSingle: async () => ({ data: { ...mocks.row }, error: null }),
        single: async () =>
          mocks.updateError
            ? { data: null, error: mocks.updateError }
            : { data: { ...mocks.row }, error: null },
      };
      return builder;
    },
  },
}));

const PHOTO = "data:image/jpeg;base64,AAAA";

const loadStore = async () => {
  vi.resetModules();
  const store = await import("../auth/authStore");
  await store.waitForAuthHydration();
  return store;
};

describe("profile", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.keys(mocks.row).forEach((key) => delete mocks.row[key]);
    Object.assign(mocks.row, {
      id: "user-1",
      username: "Sara",
      email: "sara@example.com",
      role: "admin",
      status: "active",
      created_at: "2026-09-18T12:00:00.000Z",
      updated_at: "2026-09-18T12:00:00.000Z",
    });
    mocks.session.user.app_metadata = { providers: ["email"] };
    mocks.updates.length = 0;
    mocks.updateError = null;
    mocks.updateUser.mockClear();
    mocks.signOut.mockClear();
    mocks.signInWithPassword.mockReset();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  it("loads role and status even without the avatar column", async () => {
    const store = await loadStore();
    expect(store.getCurrentUser()).toMatchObject({
      role: "admin",
      status: "active",
      avatar: null,
      hasPassword: true,
    });
  });

  it.each([
    [["discord"], false],
    [["email", "discord"], true],
    [undefined, true],
  ])("providers %j: hasPassword is %s", async (providers, expected) => {
    mocks.session.user.app_metadata = { providers };
    const store = await loadStore();
    expect(store.getCurrentUser()?.hasPassword).toBe(expected);
  });

  it("saves only what changed and notifies the app", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribeToAuth(listener);

    await store.updateCurrentProfile({ username: "Sara", avatar: PHOTO });
    expect(mocks.updates).toEqual([{ avatar: PHOTO }]);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatar: PHOTO, role: "admin" }),
    );

    await store.updateCurrentProfile({ username: " Sarita ", avatar: PHOTO });
    expect(mocks.updates[1]).toEqual({ username: "Sarita" });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { username: "Sarita" },
    });

    await store.updateCurrentProfile({ username: "Sarita", avatar: PHOTO });
    expect(mocks.updates).toHaveLength(2);

    await store.updateCurrentProfile({ username: "Sarita", avatar: null });
    expect(store.getCurrentUser()?.avatar).toBeNull();
  });

  it("rejects an invalid or taken username and keeps the current one", async () => {
    const store = await loadStore();
    await expect(
      store.updateCurrentProfile({ username: "a", avatar: null }),
    ).rejects.toThrow("auth.errors.usernameMinLength");
    expect(mocks.updates).toHaveLength(0);

    mocks.updateError = {
      message:
        'duplicate key value violates unique constraint "profiles_username_lower_key"',
    };
    await expect(
      store.updateCurrentProfile({ username: "Taken", avatar: null }),
    ).rejects.toThrow("auth.errors.usernameAlreadyRegistered");
    expect(store.getCurrentUser()?.username).toBe("Sara");
  });

  it("changes the password after checking the current one", async () => {
    const store = await loadStore();
    await store.changePassword("Actual1!", "Nueva123!");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "sara@example.com",
      password: "Actual1!",
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Nueva123!" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("doesn't change the password when the current one is wrong", async () => {
    const store = await loadStore();
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    await expect(
      store.changePassword("Mala1234!", "Nueva123!"),
    ).rejects.toThrow("profile.errors.currentPasswordWrong");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("doesn't try the current password when the new one is weak", async () => {
    const store = await loadStore();
    await expect(store.changePassword("Actual1!", "corta")).rejects.toThrow(
      "auth.errors.passwordMinLength",
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
