const SENTRY_ENV_HOSTNAMES: Array<[hostname: string, environment: string]> = [
  ["staging.excalidraw.issirmax.mx", "staging"],
  ["vercel.app", "staging"],
  ["excalidraw.issirmax.mx", "production"],
];

export const getSentryEnvironment = (
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
  isDisabled = import.meta.env.VITE_APP_DISABLE_SENTRY === "true",
): string | undefined => {
  if (isDisabled) {
    return undefined;
  }

  const matchedHostname = SENTRY_ENV_HOSTNAMES.find(
    ([item]) => hostname.indexOf(item) >= 0,
  );

  return matchedHostname?.[1];
};

export const shouldInitializeSentry = () => Boolean(getSentryEnvironment());
