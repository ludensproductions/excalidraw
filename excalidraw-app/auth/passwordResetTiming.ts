export const PASSWORD_RESET_RESPONSE_FLOOR_MS = 2000;

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export const getPasswordResetResponseDelay = (
  startedAt: number,
  currentTime = now(),
): number =>
  Math.max(PASSWORD_RESET_RESPONSE_FLOOR_MS - (currentTime - startedAt), 0);

export const getPasswordResetRequestStartedAt = (): number => now();

export const waitForPasswordResetResponseFloor = (
  startedAt: number,
): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, getPasswordResetResponseDelay(startedAt));
  });
