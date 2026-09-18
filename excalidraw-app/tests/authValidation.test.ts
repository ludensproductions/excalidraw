import {
  AUTH_FIELD_LIMITS,
  normalizeEmail,
  normalizeUsername,
  sanitizeEmailInput,
  sanitizePasswordInput,
  sanitizeUsernameInput,
  validateEmail,
  validatePassword,
  validateRegistrationFields,
  validateUsername,
} from "../auth/authValidation";

describe("auth validation", () => {
  it("normalizes username and email input", () => {
    expect(normalizeUsername("  Maria Dev  ")).toBe("Maria Dev");
    expect(normalizeEmail("  PERSON@EXAMPLE.COM  ")).toBe("PERSON@EXAMPLE.COM");
  });

  it("accepts safe usernames used in visible app chrome", () => {
    expect(validateUsername("Maria Dev_20.26")).toBeNull();
    expect(validateUsername("Jose-Alvarez")).toBeNull();
  });

  it("rejects username values that can break storage or layout", () => {
    expect(validateUsername("a")).toBe("auth.errors.usernameMinLength");
    expect(
      validateUsername("a".repeat(AUTH_FIELD_LIMITS.username.max + 1)),
    ).toBe("auth.errors.usernameMaxLength");
    expect(validateUsername("maria@example")).toBe(
      "auth.errors.usernameInvalidCharacters",
    );
    expect(validateUsername("maria\u{1f642}")).toBe(
      "auth.errors.usernameInvalidCharacters",
    );
  });

  it("validates email format and maximum length", () => {
    expect(validateEmail("person@example.com")).toBeNull();
    expect(validateEmail("person.example.com")).toBe(
      "auth.errors.emailInvalid",
    );
    expect(validateEmail("")).toBe("auth.errors.emailRequired");
    expect(validateEmail("person\u{1f642}@example.com")).toBe(
      "auth.errors.emailInvalidCharacters",
    );
    expect(validateEmail(`${"a".repeat(245)}@example.com`)).toBe(
      "auth.errors.emailMaxLength",
    );
  });

  it("validates password bounds and characters", () => {
    expect(validatePassword("Aa123456!")).toBeNull();
    expect(validatePassword("Aa1!")).toBe("auth.errors.passwordMinLength");
    expect(
      validatePassword("a".repeat(AUTH_FIELD_LIMITS.password.max + 1)),
    ).toBe("auth.errors.passwordMaxLength");
    expect(validatePassword("Abc12345\u{1f642}!")).toBe(
      "auth.errors.passwordInvalidCharacters",
    );
    expect(validatePassword("Abc 12345!")).toBe(
      "auth.errors.passwordInvalidCharacters",
    );
    expect(validatePassword("abcdefgh")).toBe(
      "auth.errors.passwordRequiresComplexity",
    );
    expect(validatePassword("ABCDEFGH1!")).toBe(
      "auth.errors.passwordRequiresComplexity",
    );
    expect(validatePassword("Abcdefgh!")).toBe(
      "auth.errors.passwordRequiresComplexity",
    );
    expect(validatePassword("Abcdefg1")).toBe(
      "auth.errors.passwordRequiresComplexity",
    );
  });

  it("sanitizes auth inputs before they reach form state", () => {
    expect(sanitizeUsernameInput("maria\u{1f642}@dev")).toBe("mariadev");
    expect(
      sanitizeUsernameInput("a".repeat(AUTH_FIELD_LIMITS.username.max + 5)),
    ).toHaveLength(AUTH_FIELD_LIMITS.username.max);

    expect(sanitizeEmailInput("pa \u{1f642}@@gmail.com")).toBe("pa@gmail.com");
    expect(
      sanitizeEmailInput("a".repeat(AUTH_FIELD_LIMITS.email.max + 5)),
    ).toHaveLength(AUTH_FIELD_LIMITS.email.max);

    expect(sanitizePasswordInput("Abc 123\u{1f642}\u00f1!")).toBe(
      "Abc123\u00f1!",
    );
    expect(
      sanitizePasswordInput("a".repeat(AUTH_FIELD_LIMITS.password.max + 5)),
    ).toHaveLength(AUTH_FIELD_LIMITS.password.max);
  });

  it("returns the first invalid registration field", () => {
    expect(
      validateRegistrationFields({
        username: "a",
        email: "person.example.com",
        password: "12345",
      }),
    ).toBe("auth.errors.usernameMinLength");
    expect(
      validateRegistrationFields({
        username: "Maria",
        email: "person@example.com",
        password: "Maria2026!",
      }),
    ).toBeNull();
  });
});
