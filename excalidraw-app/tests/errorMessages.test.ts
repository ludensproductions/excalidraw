import { getErrorMessage, translateErrorMessage } from "../errorMessages";

describe("translated error messages", () => {
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
    expect(
      getErrorMessage(new Error("Ingresa un correo electrónico válido.")),
    ).toBe("Ingresa un correo electrónico válido.");
  });

  it("hides unknown English technical errors behind a Spanish fallback", () => {
    expect(getErrorMessage(new Error("Unexpected backend condition"))).toBe(
      "Ocurrió un error técnico. Inténtalo de nuevo o contacta al administrador.",
    );
  });
});
