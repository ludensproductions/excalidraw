import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";

import type { AuthEmailFlowResult } from "../auth/authStore";

const mocks = vi.hoisted(() => ({ flow: vi.fn() }));

vi.mock("@excalidraw/excalidraw/i18n", () => ({ t: (key: string) => key }));

vi.mock("../errorMessages", () => ({
  translateErrorMessage: (message: string) => message,
  getErrorMessage: (error: Error) => error.message,
}));

vi.mock("../useHandleAppTheme", () => ({
  useHandleAppTheme: () => ({ editorTheme: "light", setAppTheme: () => {} }),
}));

vi.mock("../data/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock("../auth/authStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authStore")>()),
  beginAuthEmailFlowFromUrl: mocks.flow,
}));

const { AuthPage } = await import("../auth/AuthPage");

const user = { id: "user-1" };
const isFormVisible = () => screen.queryByText("auth.title.login") !== null;
const isLoaderVisible = () => screen.queryByRole("status") !== null;

describe("auth page opened with a session in the URL", () => {
  let finish: (result: AuthEmailFlowResult) => Promise<void>;
  let fail: () => Promise<void>;
  const onAuthenticated = vi.fn();

  const open = (path: string) => {
    window.history.replaceState({}, "", path);
    const flow = new Promise<AuthEmailFlowResult>((resolve, reject) => {
      finish = (result) => act(async () => resolve(result));
      fail = () => act(async () => reject(new Error("nope")));
    });
    mocks.flow.mockReturnValue(flow);
    render(
      <StrictMode>
        <AuthPage onAuthenticated={onAuthenticated} />
      </StrictMode>,
    );
  };

  beforeEach(() => onAuthenticated.mockClear());
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each(["/", "/#room=abc123,key456", "/?error=access_denied"])(
    "shows the form right away on %s",
    (path) => {
      open(path);
      expect(isFormVisible()).toBe(true);
      expect(isLoaderVisible()).toBe(false);
    },
  );

  it.each([
    ["/#access_token=a&refresh_token=b", "oauthSignedIn"],
    ["/?token_hash=a&type=signup", "emailVerified"],
  ] as const)(
    "never shows the form while signing in on %s",
    async (path, type) => {
      open(path);
      expect(isFormVisible()).toBe(false);
      expect(isLoaderVisible()).toBe(true);

      await finish({ type, user: user as any });
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
      // the app is still resolving which view to open
      expect(isFormVisible()).toBe(false);
    },
  );

  it("shows the form with the error when signing in fails", async () => {
    open("/#access_token=a&refresh_token=b");
    await finish({ type: "oauthFailed", message: "banned" });
    expect(isFormVisible()).toBe(true);
    expect(screen.getByText("banned")).toBeTruthy();
  });

  it("shows the new password form for recovery links", async () => {
    open("/?token_hash=a&type=recovery");
    await finish({ type: "passwordRecovery" });
    expect(screen.getByText("auth.title.reset")).toBeTruthy();
  });

  it("doesn't get stuck loading", async () => {
    open("/?token=a");
    await finish({ type: "none" });
    expect(isFormVisible()).toBe(true);
  });

  it("doesn't get stuck loading when the link can't be opened", async () => {
    open("/?code=a");
    await fail();
    expect(isLoaderVisible()).toBe(false);
    expect(screen.getByText("nope")).toBeTruthy();
  });
});
