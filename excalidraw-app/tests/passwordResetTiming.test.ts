import {
  PASSWORD_RESET_RESPONSE_FLOOR_MS,
  getPasswordResetResponseDelay,
} from "../auth/passwordResetTiming";

describe("password reset timing", () => {
  it("keeps fast password reset responses behind a minimum response floor", () => {
    expect(getPasswordResetResponseDelay(1000, 1000)).toBe(
      PASSWORD_RESET_RESPONSE_FLOOR_MS,
    );
    expect(getPasswordResetResponseDelay(1000, 2200)).toBe(
      PASSWORD_RESET_RESPONSE_FLOOR_MS - 1200,
    );
    expect(
      getPasswordResetResponseDelay(
        1000,
        1000 + PASSWORD_RESET_RESPONSE_FLOOR_MS,
      ),
    ).toBe(0);
    expect(
      getPasswordResetResponseDelay(
        1000,
        1000 + PASSWORD_RESET_RESPONSE_FLOOR_MS + 100,
      ),
    ).toBe(0);
  });
});
