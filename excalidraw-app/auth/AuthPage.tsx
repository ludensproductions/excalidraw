import { useState } from "react";
import { loginUser, registerUser } from "./authStore";
import type { AuthUser } from "./authStore";
import "./AuthPage.scss";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

type Mode = "login" | "register";

export const AuthPage: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let user: AuthUser;
      if (mode === "register") {
        if (username.trim().length < 2) {
          throw new Error("El nombre de usuario debe tener al menos 2 caracteres.");
        }
        if (password.length < 6) {
          throw new Error("La contraseña debe tener al menos 6 caracteres.");
        }
        user = await registerUser(username.trim(), email.trim(), password);
      } else {
        user = await loginUser(email.trim(), password);
      }
      onAuthenticated(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setUsername("");
    setEmail("");
    setPassword("");
  };

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <div className="auth-page__logo">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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

        <h1 className="auth-page__title">
          {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta"}
        </h1>
        <p className="auth-page__subtitle">
          {mode === "login"
            ? "Inicia sesión para continuar"
            : "Regístrate para empezar a dibujar"}
        </p>

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

          <div className="auth-page__field">
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus={mode === "login"}
            />
          </div>

          <div className="auth-page__field">
            <label htmlFor="auth-password">Contraseña</label>
            <input
              id="auth-password"
              type="password"
              placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Tu contraseña"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="auth-page__error" role="alert">{error}</div>}

          <button
            type="submit"
            className="auth-page__submit"
            disabled={loading}
          >
            {loading
              ? "Cargando..."
              : mode === "login"
              ? "Iniciar sesión"
              : "Crear cuenta"}
          </button>
        </form>

        <div className="auth-page__toggle">
          {mode === "login" ? (
            <>
              ¿No tienes cuenta?{" "}
              <button type="button" onClick={switchMode}>
                Regístrate
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button type="button" onClick={switchMode}>
                Inicia sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
