import { useEffect, useState } from "react";

import { THEME } from "@excalidraw/excalidraw";

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
          setMessage("Ingresa tu nueva contrasena.");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMode("forgot");
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo abrir el enlace de recuperacion.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          throw new Error(
            "El nombre de usuario debe tener al menos 2 caracteres.",
          );
        }
        if (password.length < 6) {
          throw new Error("La contrasena debe tener al menos 6 caracteres.");
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
        setMessage(
          "Te enviamos un correo con el enlace para recuperar tu contrasena.",
        );
        return;
      }

      if (mode === "reset") {
        if (password !== confirmPassword) {
          throw new Error("Las contrasenas no coinciden.");
        }

        const user = await updatePassword(password);
        onAuthenticated(user);
        return;
      }

      const user = await loginUser(email.trim(), password);
      onAuthenticated(user);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Ocurrio un error inesperado.",
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
      ? "Bienvenido de vuelta"
      : mode === "register"
        ? "Crear cuenta"
        : mode === "forgot"
          ? "Recuperar contrasena"
          : "Nueva contrasena";

  const subtitle =
    mode === "login"
      ? "Inicia sesion para continuar"
      : mode === "register"
        ? "Registrate para empezar a dibujar"
        : mode === "forgot"
          ? "Te enviaremos un enlace a tu correo"
          : "Escribe los nuevos datos de acceso";

  const submitLabel = loading
    ? "Cargando..."
    : mode === "login"
      ? "Iniciar sesion"
      : mode === "register"
        ? "Crear cuenta"
        : mode === "forgot"
          ? "Enviar correo"
          : "Guardar contrasena";

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
          title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
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
              <label htmlFor="auth-username">Nombre de usuario</label>
              <input
                id="auth-username"
                type="text"
                placeholder="Tu nombre"
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
              <label htmlFor="auth-email">Correo electronico</label>
              <input
                id="auth-email"
                type="email"
                placeholder="correo@ejemplo.com"
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
                {mode === "reset" ? "Nueva contrasena" : "Contrasena"}
              </label>
              <input
                id="auth-password"
                type="password"
                placeholder={
                  mode === "login" ? "Tu contrasena" : "Minimo 6 caracteres"
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
                Confirmar contrasena
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                placeholder="Repite la contrasena"
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
                Olvide mi contrasena
              </button>
              <span className="auth-page__toggle-separator">|</span>
              No tienes cuenta?{" "}
              <button type="button" onClick={switchMode}>
                Registrate
              </button>
            </>
          ) : mode === "register" ? (
            <>
              Ya tienes cuenta?{" "}
              <button type="button" onClick={switchMode}>
                Inicia sesion
              </button>
            </>
          ) : (
            <button type="button" onClick={goToLogin}>
              Volver al inicio de sesion
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
