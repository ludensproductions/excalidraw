import { useEffect, useState } from "react";
import { THEME } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";

import { useHandleAppTheme } from "../useHandleAppTheme";
import { getErrorMessage } from "../errorMessages";

import {
  beginAuthEmailFlowFromUrl,
  getPasswordResetResendWaitSeconds,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendEmailVerification,
  updatePassword,
} from "./authStore";
import {
  AUTH_FIELD_LIMITS,
  USERNAME_ALLOWED_CHARS_PATTERN,
  normalizeEmail,
  normalizeUsername,
  sanitizeEmailInput,
  sanitizePasswordInput,
  sanitizeUsernameInput,
  validatePassword,
  validateRegistrationFields,
} from "./authValidation";
import "./AuthPage.scss";

import type { AuthUser } from "./authStore";
interface Props {
  onAuthenticated: (user: AuthUser) => void;
}
type Mode = "login" | "register" | "forgot" | "reset" | "verify";

type InputSanitizer = (value: string) => string;
type InputValueSetter = (value: string) => void;

const getValueWithInsertedText = (input: HTMLInputElement, text: string) => {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;

  return `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
};

const preventUnsanitizedInput =
  (sanitize: InputSanitizer) => (event: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;

    if (nativeEvent.isComposing || !nativeEvent.data) {
      return;
    }

    const nextValue = getValueWithInsertedText(
      event.currentTarget,
      nativeEvent.data,
    );

    if (sanitize(nextValue) !== nextValue) {
      event.preventDefault();
    }
  };

const pasteSanitizedInput =
  (setValue: InputValueSetter, sanitize: InputSanitizer) =>
  (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData("text");

    if (!pastedText) {
      return;
    }

    event.preventDefault();

    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? input.value.length;
    const nextValue = getValueWithInsertedText(input, pastedText);
    const cursorPosition = sanitize(
      `${input.value.slice(0, selectionStart)}${pastedText}`,
    ).length;

    setValue(sanitize(nextValue));

    window.requestAnimationFrame(() => {
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

export const AuthPage: React.FC<Props> = ({ onAuthenticated }) => {
  const { editorTheme, setAppTheme } = useHandleAppTheme();
  const isDark = editorTheme === THEME.DARK;
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordResetWaitSeconds, setPasswordResetWaitSeconds] = useState(0);
  useEffect(() => {
    let cancelled = false;
    beginAuthEmailFlowFromUrl()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.type === "passwordRecovery") {
          setMode("reset");
          setMessage(t("auth.messages.enterNewPassword"));
          return;
        }

        if (result.type === "emailVerified") {
          setMessage(t("auth.messages.emailVerified"));
          onAuthenticated(result.user);
          return;
        }

        if (result.type === "verificationExpired") {
          setMode("verify");
          setError(t("auth.errors.verificationLinkExpired"));
          return;
        }

        if (result.type === "verificationInvalid") {
          setMode("verify");
          setError(t("auth.errors.verificationLinkInvalid"));
          return;
        }

        if (result.type === "emailAlreadyVerified") {
          setMode("login");
          setMessage(t("auth.messages.emailAlreadyVerified"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMode("forgot");
          setError(
            getErrorMessage(err, t("auth.errors.openRecoveryLinkFailed")),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);
  useEffect(() => {
    if (mode !== "forgot" || !email) {
      setPasswordResetWaitSeconds(0);
      return;
    }

    const updateWaitSeconds = () => {
      setPasswordResetWaitSeconds(getPasswordResetResendWaitSeconds(email));
    };

    updateWaitSeconds();
    const intervalId = window.setInterval(updateWaitSeconds, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [email, mode]);
  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);
    try {
      if (mode === "register") {
        const validationError = validateRegistrationFields({
          username,
          email,
          password,
        });
        if (validationError) {
          throw new Error(t(validationError));
        }
        const result = await registerUser(
          normalizeUsername(username),
          normalizeEmail(email),
          password,
        );
        if (result.status === "pendingVerification") {
          setEmail(result.email);
          setPassword("");
          setConfirmPassword("");
          setMode("verify");
          setMessage(t("auth.messages.verificationEmailSent"));
          return;
        }

        onAuthenticated(result.user);
        return;
      }
      if (mode === "verify") {
        await resendEmailVerification(email);
        setMessage(t("auth.messages.verificationEmailResent"));
        return;
      }
      if (mode === "forgot") {
        await requestPasswordReset(email);
        setPasswordResetWaitSeconds(getPasswordResetResendWaitSeconds(email));
        setMessage(t("auth.messages.resetEmailSent"));
        return;
      }
      if (mode === "reset") {
        if (password !== confirmPassword) {
          throw new Error(t("auth.errors.passwordsDoNotMatch"));
        }
        const validationError = validatePassword(password);
        if (validationError) {
          throw new Error(t(validationError));
        }
        const user = await updatePassword(password);
        onAuthenticated(user);
        return;
      }
      const user = await loginUser(normalizeEmail(email), password);
      onAuthenticated(user);
    } catch (err: unknown) {
      const nextError = getErrorMessage(err, t("auth.errors.unexpected"));
      setError(nextError);

      if (nextError === t("auth.errors.emailNotVerified")) {
        setPassword("");
        setMode("verify");
      }
    } finally {
      setLoading(false);
    }
  };
  const clearInputs = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };
  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    resetFeedback();
    clearInputs();
  };
  const goToForgotPassword = () => {
    setMode("forgot");
    resetFeedback();
    setPassword("");
    setConfirmPassword("");
  };
  const goToLogin = () => {
    setMode("login");
    resetFeedback();
    setPassword("");
    setConfirmPassword("");
  };
  const title =
    mode === "login"
      ? t("auth.title.login")
      : mode === "register"
      ? t("auth.title.register")
      : mode === "forgot"
      ? t("auth.title.forgot")
      : mode === "verify"
      ? t("auth.title.verify")
      : t("auth.title.reset");
  const subtitle =
    mode === "login"
      ? t("auth.subtitle.login")
      : mode === "register"
      ? t("auth.subtitle.register")
      : mode === "forgot"
      ? t("auth.subtitle.forgot")
      : mode === "verify"
      ? t("auth.subtitle.verify")
      : t("auth.subtitle.reset");
  const submitLabel = loading
    ? t("auth.actions.loading")
    : mode === "login"
    ? t("auth.actions.login")
    : mode === "register"
    ? t("auth.actions.register")
    : mode === "forgot"
    ? passwordResetWaitSeconds > 0
      ? t("auth.actions.resendRecoveryIn", {
          seconds: passwordResetWaitSeconds,
        })
      : t("auth.actions.sendEmail")
    : mode === "verify"
    ? t("auth.actions.resendVerification")
    : t("auth.actions.savePassword");
  const shouldConstrainPassword = mode !== "login";
  const isSubmitDisabled =
    loading || (mode === "forgot" && passwordResetWaitSeconds > 0);
  return (
    <div className={`auth-page${isDark ? " auth-page--dark" : ""}`}>
      <div className="auth-page__card">
        <div className="auth-page__logo">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="100" height="100" rx="20" fill="#6965db" />
            <path
              d="M20 75 L50 25 L80 75"
              stroke="white"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <line
              x1="32"
              y1="58"
              x2="68"
              y2="58"
              stroke="white"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </svg>
          <span>Excalidraw</span>
        </div>
        <button
          className="auth-page__theme-toggle"
          onClick={() => setAppTheme(isDark ? THEME.LIGHT : THEME.DARK)}
          title={isDark ? t("app.switchToLight") : t("app.switchToDark")}
        >
          {isDark ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <h1 className="auth-page__title">{title}</h1>
        <p className="auth-page__subtitle">{subtitle}</p>
        <form className="auth-page__form" onSubmit={handleSubmit} noValidate>
          {mode === "register" && (
            <div className="auth-page__field">
              <label htmlFor="auth-username">{t("auth.fields.username")}</label>
              <input
                id="auth-username"
                type="text"
                placeholder={t("auth.placeholders.username")}
                value={username}
                onChange={(e) =>
                  setUsername(sanitizeUsernameInput(e.target.value))
                }
                onBeforeInput={preventUnsanitizedInput(sanitizeUsernameInput)}
                onPaste={pasteSanitizedInput(
                  setUsername,
                  sanitizeUsernameInput,
                )}
                required
                minLength={AUTH_FIELD_LIMITS.username.min}
                maxLength={AUTH_FIELD_LIMITS.username.max}
                pattern={USERNAME_ALLOWED_CHARS_PATTERN}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
              />
            </div>
          )}
          {mode !== "reset" && (
            <div className="auth-page__field">
              <label htmlFor="auth-email">{t("auth.fields.email")}</label>
              <input
                id="auth-email"
                type="email"
                placeholder={t("auth.placeholders.email")}
                value={email}
                onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
                onBeforeInput={preventUnsanitizedInput(sanitizeEmailInput)}
                onPaste={pasteSanitizedInput(setEmail, sanitizeEmailInput)}
                required
                minLength={AUTH_FIELD_LIMITS.email.min}
                maxLength={AUTH_FIELD_LIMITS.email.max}
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
                autoFocus={
                  mode === "login" || mode === "forgot" || mode === "verify"
                }
              />
            </div>
          )}
          {mode !== "forgot" && mode !== "verify" && (
            <div className="auth-page__field">
              <label htmlFor="auth-password">
                {mode === "reset"
                  ? t("auth.fields.newPassword")
                  : t("auth.fields.password")}
              </label>
              <input
                id="auth-password"
                type="password"
                placeholder={
                  mode === "login"
                    ? t("auth.placeholders.password")
                    : t("auth.placeholders.newPassword")
                }
                value={password}
                onChange={(e) =>
                  setPassword(
                    shouldConstrainPassword
                      ? sanitizePasswordInput(e.target.value)
                      : e.target.value,
                  )
                }
                onBeforeInput={
                  shouldConstrainPassword
                    ? preventUnsanitizedInput(sanitizePasswordInput)
                    : undefined
                }
                onPaste={
                  shouldConstrainPassword
                    ? pasteSanitizedInput(setPassword, sanitizePasswordInput)
                    : undefined
                }
                required
                minLength={
                  shouldConstrainPassword
                    ? AUTH_FIELD_LIMITS.password.min
                    : undefined
                }
                maxLength={
                  shouldConstrainPassword
                    ? AUTH_FIELD_LIMITS.password.max
                    : undefined
                }
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                autoFocus={mode === "reset"}
              />
            </div>
          )}
          {mode === "reset" && (
            <div className="auth-page__field">
              <label htmlFor="auth-confirm-password">
                {t("auth.fields.confirmPassword")}
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                placeholder={t("auth.placeholders.confirmPassword")}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(sanitizePasswordInput(e.target.value))
                }
                onBeforeInput={preventUnsanitizedInput(sanitizePasswordInput)}
                onPaste={pasteSanitizedInput(
                  setConfirmPassword,
                  sanitizePasswordInput,
                )}
                required
                minLength={AUTH_FIELD_LIMITS.password.min}
                maxLength={AUTH_FIELD_LIMITS.password.max}
                autoComplete="new-password"
              />
            </div>
          )}
          {error && (
            <div className="auth-page__error" role="alert">
              {error}
            </div>
          )}
          {message && <div className="auth-page__message">{message}</div>}
          <button
            type="submit"
            className="auth-page__submit"
            disabled={isSubmitDisabled}
          >
            {submitLabel}
          </button>
        </form>
        <div className="auth-page__toggle">
          {mode === "login" ? (
            <>
              <button type="button" onClick={goToForgotPassword}>
                {t("auth.actions.forgotPassword")}
              </button>
              <span className="auth-page__toggle-separator">|</span>
              {t("auth.actions.noAccount")}{" "}
              <button type="button" onClick={switchMode}>
                {t("auth.actions.registerLink")}
              </button>
            </>
          ) : mode === "register" ? (
            <>
              {t("auth.actions.hasAccount")}{" "}
              <button type="button" onClick={switchMode}>
                {t("auth.actions.loginLink")}
              </button>
            </>
          ) : (
            <button type="button" onClick={goToLogin}>
              {t("auth.actions.backToLogin")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
