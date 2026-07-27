import { useEffect, useState } from "react";
import { THEME } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { useHandleAppTheme } from "../useHandleAppTheme";
import {
  beginPasswordRecoveryFromUrl,
  loginUser,
  registerUser,
  requestPasswordReset,
  updatePassword,
} from "./authStore";
import "./AuthPage.scss";
import type { AuthUser } from "./authStore";
interface Props {
  onAuthenticated: (user: AuthUser) => void;
}
type Mode = "login" | "register" | "forgot" | "reset";
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
  useEffect(() => {
    let cancelled = false;
    beginPasswordRecoveryFromUrl()
      .then((isRecovery) => {
        if (!cancelled && isRecovery) {
          setMode("reset");
          setMessage(t("auth.messages.enterNewPassword"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMode("forgot");
          setError(
            err instanceof Error
              ? err.message
              : t("auth.errors.openRecoveryLinkFailed"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);
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
        if (username.trim().length < 2) {
          throw new Error(t("auth.errors.usernameMinLength"));
        }
        if (password.length < 6) {
          throw new Error(t("auth.errors.passwordMinLength"));
        }
        const user = await registerUser(
          username.trim(),
          email.trim(),
          password,
        );
        onAuthenticated(user);
        return;
      }
      if (mode === "forgot") {
        await requestPasswordReset(email);
        setMessage(t("auth.messages.resetEmailSent"));
        return;
      }
      if (mode === "reset") {
        if (password !== confirmPassword) {
          throw new Error(t("auth.errors.passwordsDoNotMatch"));
        }
        const user = await updatePassword(password);
        onAuthenticated(user);
        return;
      }
      const user = await loginUser(email.trim(), password);
      onAuthenticated(user);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("auth.errors.unexpected"),
      );
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
          : t("auth.title.reset");
  const subtitle =
    mode === "login"
      ? t("auth.subtitle.login")
      : mode === "register"
        ? t("auth.subtitle.register")
        : mode === "forgot"
          ? t("auth.subtitle.forgot")
          : t("auth.subtitle.reset");
  const submitLabel = loading
    ? t("auth.actions.loading")
    : mode === "login"
      ? t("auth.actions.login")
      : mode === "register"
        ? t("auth.actions.register")
        : mode === "forgot"
          ? t("auth.actions.sendEmail")
          : t("auth.actions.savePassword");
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
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
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
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus={mode === "login" || mode === "forgot"}
              />
            </div>
          )}
          {mode !== "forgot" && (
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
                onChange={(e) => setPassword(e.target.value)}
                required
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
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
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
            disabled={loading}
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
              {t("auth.actions.noAccount")} {" "}
              <button type="button" onClick={switchMode}>
                {t("auth.actions.registerLink")}
              </button>
            </>
          ) : mode === "register" ? (
            <>
              {t("auth.actions.hasAccount")} {" "}
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
