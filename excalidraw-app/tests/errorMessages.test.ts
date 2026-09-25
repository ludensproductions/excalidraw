import { setLanguage, t } from "@excalidraw/excalidraw/i18n";

import { getErrorMessage, translateErrorMessage } from "../errorMessages";

describe("translated error messages (es-ES)", () => {
  beforeAll(async () => {
    await setLanguage({ code: "es-ES", label: "Español" });
  });

  afterAll(async () => {
    await setLanguage({ code: "en", label: "English" });
  });

  it("translates provider email validation errors", () => {
    expect(
      translateErrorMessage("Unable to validate email address: invalid format"),
    ).toBe("El correo electrónico no tiene un formato válido.");
  });

  it("translates common Supabase/PostgREST errors", () => {
    expect(getErrorMessage(new Error("Invalid login credentials"))).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(getErrorMessage(new Error("Database error saving new user"))).toBe(
      "No se pudo crear la cuenta. Si este correo ya está registrado, inicia sesión o recupera tu contraseña.",
    );
    expect(
      getErrorMessage(new Error("Email link is invalid or has expired")),
    ).toBe(
      "El enlace de verificación caducó. Solicita un nuevo correo de verificación.",
    );
    expect(
      getErrorMessage({
        message: "new row violates row-level security policy",
        code: "42501",
      }),
    ).toBe("No tienes permisos para realizar esta acción.");
  });

  it("keeps already translated user-facing errors", () => {
    const message = t("auth.errors.passwordResetResendTooSoon", {
      seconds: 30,
    });
    expect(getErrorMessage(new Error(message))).toBe(message);
  });

  it("hides unknown English technical errors behind a Spanish fallback", () => {
    expect(getErrorMessage(new Error("Unexpected backend condition"))).toBe(
      "Ocurrió un error técnico. Inténtalo de nuevo o contacta al administrador.",
    );
  });
});

describe("translated error messages (en)", () => {
  beforeAll(async () => {
    await setLanguage({ code: "en", label: "English" });
  });

  it("translates provider errors to English", () => {
    expect(getErrorMessage(new Error("Invalid login credentials"))).toBe(
      "Incorrect email or password.",
    );
  });

  it("keeps already translated English messages", () => {
    const message = t("app.couldNotSaveBoard");
    expect(getErrorMessage(new Error(message))).toBe(message);
  });

  it("hides unknown technical errors behind an English fallback", () => {
    expect(getErrorMessage(new Error("Unexpected backend condition"))).toBe(
      "A technical error occurred. Please try again or contact the administrator.",
    );
  });
});
