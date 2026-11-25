import type * as AuthStore from "../auth/authStore";

const mocks = vi.hoisted(() => ({
  status: "active",
  enabled: true,
  // profiles.avatar in the database, and what the app reads of it
  storedAvatar: null as string | null,
  profileLoads: true,
  updateUser: vi.fn(() => Promise.resolve({ error: null })),
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
      updateUser: mocks.updateUser,
    },
    from: () => {
      let changes: { avatar: string } | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        update: (values: { avatar: string }) => {
          changes = values;
          return builder;
        },
        maybeSingle: async () => {
          if (changes) {
            if (mocks.storedAvatar) {
              return { data: null, error: null };
            }
            mocks.storedAvatar = changes.avatar;
            return { data: { id: "user-1" }, error: null };
          }
          return mocks.profileLoads
            ? {
                data: {
                  username: "sara",
                  status: mocks.status,
                  avatar: mocks.storedAvatar,
                },
                error: null,
              }
            : { data: null, error: { message: "timeout" } };
        },
      };
      return builder;
    },
  },
}));

const SHARED_LINK = "/#room=abc123,key456";
const TOKENS = "#access_token=token&refresh_token=refresh&token_type=bearer";
const currentPath = () =>
  window.location.pathname + window.location.search + window.location.hash;

describe("sign in with Discord / Microsoft", () => {
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
      json: async () => ({
        external: { discord: mocks.enabled, azure: mocks.enabled },
      }),
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

  it("asks Microsoft for the email and the name", async () => {
    await store.signInWithProvider("azure");
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "azure",
        options: expect.objectContaining({ scopes: "email profile" }),
      }),
    );
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
      "error=access_denied&error_subcode=cancel&error_description=AADSTS65004%3A+User+declined+to+consent",
      "auth.errors.oauthCancelled",
    ],
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

  describe("Discord photo", () => {
    const PHOTO_URL = "https://cdn.discordapp.com/avatars/1/a_hash.gif";
    const IMPORTED = "data:image/jpeg;base64,DISCORD";
    const OWN = "data:image/jpeg;base64,OWN";
    const fetchPhoto = vi.fn();

    beforeEach(() => {
      mocks.storedAvatar = null;
      mocks.profileLoads = true;
      mocks.updateUser.mockClear();
      fetchPhoto.mockReset();
      fetchPhoto.mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/png" }),
      });
      vi.stubGlobal("fetch", fetchPhoto);
      vi.stubGlobal("createImageBitmap", async () => ({
        width: 256,
        height: 256,
        close: () => {},
      }));
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillRect: () => {},
        drawImage: () => {},
      } as any);
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        IMPORTED,
      );
    });

    const signIn = async ({
      provider = "discord",
      url = PHOTO_URL as string | undefined,
      metadata = {},
    } = {}) => {
      mocks.setSession.mockResolvedValue({
        data: {
          session: {
            user: {
              id: "user-1",
              email: "sara@example.com",
              app_metadata: { providers: [provider] },
              user_metadata: metadata,
              identities: [{ provider, identity_data: { avatar_url: url } }],
            },
          },
        },
        error: null,
      });
      await expect(comeBackTo(`/${TOKENS}`)).resolves.toMatchObject({
        type: "oauthSignedIn",
      });
      // the import runs after signing in, without delaying it
      await new Promise((resolve) => setTimeout(resolve, 20));
    };

    it("becomes the profile photo, as a still image", async () => {
      await signIn();
      expect(fetchPhoto).toHaveBeenCalledWith(
        "https://cdn.discordapp.com/avatars/1/a_hash.png?size=256",
      );
      expect(mocks.storedAvatar).toBe(IMPORTED);
      expect(store.getCurrentUser()?.avatar).toBe(IMPORTED);
      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { avatar_imported: true },
      });
    });

    it("doesn't replace the user's own photo", async () => {
      mocks.storedAvatar = OWN;
      await signIn();
      expect(fetchPhoto).not.toHaveBeenCalled();
      expect(store.getCurrentUser()?.avatar).toBe(OWN);
    });

    it("doesn't replace it when the profile failed to load", async () => {
      mocks.storedAvatar = OWN;
      mocks.profileLoads = false;
      await signIn();
      expect(fetchPhoto).toHaveBeenCalled();
      expect(mocks.storedAvatar).toBe(OWN);
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it.each([
      ["it was imported before", { metadata: { avatar_imported: true } }],
      [
        "it is Discord's default picture",
        { url: "https://cdn.discordapp.com/embed/avatars/0.png" },
      ],
      ["it is on another host", { url: "https://example.com/a.png" }],
      ["there is none", { url: undefined, provider: "azure" }],
      ["it belongs to another provider", { provider: "azure" }],
    ])("is skipped when %s", async (_reason, options) => {
      await signIn(options);
      expect(fetchPhoto).not.toHaveBeenCalled();
      expect(mocks.storedAvatar).toBeNull();
    });

    it.each([
      ["HTTP error", () => fetchPhoto.mockResolvedValue({ ok: false })],
      ["offline", () => fetchPhoto.mockRejectedValue(new TypeError("offline"))],
    ])("doesn't block signing in (%s)", async (_reason, fail) => {
      fail();
      await signIn();
      expect(store.getCurrentUser()).toMatchObject({
        id: "user-1",
        avatar: null,
      });
    });
  });

  it("still reports expired email links as such", async () => {
    await expect(
      comeBackTo("/?error=access_denied&error_code=otp_expired"),
    ).resolves.toEqual({ type: "verificationExpired" });
  });
});
