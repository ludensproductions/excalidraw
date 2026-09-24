import { getSentryEnvironment, shouldInitializeSentry } from "../sentryConfig";

describe("sentry config", () => {
  it("does not initialize Sentry for local or self-hosted hostnames", () => {
    expect(getSentryEnvironment("localhost", false)).toBeUndefined();
    expect(getSentryEnvironment("issirmax.local", false)).toBeUndefined();
  });

  it("maps known production and staging hostnames", () => {
    expect(getSentryEnvironment("excalidraw.issirmax.mx", false)).toBe(
      "production",
    );
    expect(getSentryEnvironment("staging.excalidraw.issirmax.mx", false)).toBe(
      "staging",
    );
    expect(getSentryEnvironment("preview.vercel.app", false)).toBe("staging");
  });

  it("does not initialize Sentry when disabled by env", () => {
    expect(
      getSentryEnvironment("excalidraw.issirmax.mx", true),
    ).toBeUndefined();
  });

  it("keeps the default initializer disabled in the local test env", () => {
    expect(shouldInitializeSentry()).toBe(false);
  });
});
