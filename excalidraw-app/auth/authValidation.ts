export const AUTH_FIELD_LIMITS = {
  username: {
    min: 2,
    max: 60,
  },
  email: {
    min: 5,
    max: 254,
  },
  password: {
    min: 8,
    max: 128,
  },
} as const;

export const USERNAME_ALLOWED_CHARS_PATTERN = "[\\p{L}\\p{M}\\p{N}._ -]+";

const USERNAME_ALLOWED_CHAR_REGEX = /^[\p{L}\p{M}\p{N}._ -]$/u;
const USERNAME_ALLOWED_CHARS_REGEX = /^[\p{L}\p{M}\p{N}._ -]+$/u;
const EMAIL_ALLOWED_CHAR_REGEX = /^[A-Z0-9._%+@-]$/i;
const EMAIL_ALLOWED_CHARS_REGEX = /^[A-Z0-9._%+@-]+$/i;
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PASSWORD_DISALLOWED_CHAR_REGEX =
  /[\s\p{C}\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u;
const PASSWORD_LOWERCASE_REGEX = /\p{Ll}/u;
const PASSWORD_UPPERCASE_REGEX = /\p{Lu}/u;
const PASSWORD_NUMBER_REGEX = /\p{N}/u;
const PASSWORD_SPECIAL_CHAR_REGEX = /[^\p{L}\p{M}\p{N}]/u;

export type AuthValidationError =
  | "auth.errors.usernameMinLength"
  | "auth.errors.usernameMaxLength"
  | "auth.errors.usernameInvalidCharacters"
  | "auth.errors.emailRequired"
  | "auth.errors.emailInvalidCharacters"
  | "auth.errors.emailInvalid"
  | "auth.errors.emailMaxLength"
  | "auth.errors.passwordMinLength"
  | "auth.errors.passwordMaxLength"
  | "auth.errors.passwordInvalidCharacters"
  | "auth.errors.passwordRequiresComplexity";

type RegistrationFields = {
  username: string;
  email: string;
  password: string;
};

const countCharacters = (value: string) => Array.from(value).length;

const sanitizeCharacters = (
  value: string,
  isAllowed: (character: string) => boolean,
  maxLength: number,
) => {
  let sanitized = "";

  for (const character of Array.from(value)) {
    if (!isAllowed(character)) {
      continue;
    }

    sanitized += character;

    if (countCharacters(sanitized) >= maxLength) {
      break;
    }
  }

  return sanitized;
};

export const normalizeUsername = (username: string) => username.trim();

export const normalizeEmail = (email: string) => email.trim();

export const sanitizeUsernameInput = (username: string) =>
  sanitizeCharacters(
    username,
    (character) => USERNAME_ALLOWED_CHAR_REGEX.test(character),
    AUTH_FIELD_LIMITS.username.max,
  );

export const sanitizeEmailInput = (email: string) => {
  let hasAtSign = false;

  return sanitizeCharacters(
    email,
    (character) => {
      if (!EMAIL_ALLOWED_CHAR_REGEX.test(character)) {
        return false;
      }
      if (character === "@") {
        if (hasAtSign) {
          return false;
        }
        hasAtSign = true;
      }
      return true;
    },
    AUTH_FIELD_LIMITS.email.max,
  );
};

export const sanitizePasswordInput = (password: string) =>
  sanitizeCharacters(
    password,
    (character) => !PASSWORD_DISALLOWED_CHAR_REGEX.test(character),
    AUTH_FIELD_LIMITS.password.max,
  );

export const validateUsername = (
  username: string,
): AuthValidationError | null => {
  const normalized = normalizeUsername(username);
  const length = countCharacters(normalized);

  if (length < AUTH_FIELD_LIMITS.username.min) {
    return "auth.errors.usernameMinLength";
  }
  if (length > AUTH_FIELD_LIMITS.username.max) {
    return "auth.errors.usernameMaxLength";
  }
  if (!USERNAME_ALLOWED_CHARS_REGEX.test(normalized)) {
    return "auth.errors.usernameInvalidCharacters";
  }

  return null;
};

export const validateEmail = (email: string): AuthValidationError | null => {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return "auth.errors.emailRequired";
  }
  if (countCharacters(normalized) > AUTH_FIELD_LIMITS.email.max) {
    return "auth.errors.emailMaxLength";
  }
  if (!EMAIL_ALLOWED_CHARS_REGEX.test(normalized)) {
    return "auth.errors.emailInvalidCharacters";
  }
  if (
    countCharacters(normalized) < AUTH_FIELD_LIMITS.email.min ||
    !EMAIL_REGEX.test(normalized)
  ) {
    return "auth.errors.emailInvalid";
  }

  return null;
};

export const validatePassword = (
  password: string,
): AuthValidationError | null => {
  const length = countCharacters(password);

  if (length < AUTH_FIELD_LIMITS.password.min) {
    return "auth.errors.passwordMinLength";
  }
  if (length > AUTH_FIELD_LIMITS.password.max) {
    return "auth.errors.passwordMaxLength";
  }
  if (PASSWORD_DISALLOWED_CHAR_REGEX.test(password)) {
    return "auth.errors.passwordInvalidCharacters";
  }
  if (
    !PASSWORD_LOWERCASE_REGEX.test(password) ||
    !PASSWORD_UPPERCASE_REGEX.test(password) ||
    !PASSWORD_NUMBER_REGEX.test(password) ||
    !PASSWORD_SPECIAL_CHAR_REGEX.test(password)
  ) {
    return "auth.errors.passwordRequiresComplexity";
  }

  return null;
};

export const validateRegistrationFields = ({
  username,
  email,
  password,
}: RegistrationFields): AuthValidationError | null =>
  validateUsername(username) ??
  validateEmail(email) ??
  validatePassword(password);
