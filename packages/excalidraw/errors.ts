type CANVAS_ERROR_NAMES = "CANVAS_ERROR" | "CANVAS_POSSIBLY_TOO_BIG";

export class CanvasError extends Error {
  constructor(
    message: string = "Couldn't export canvas.",
    name: CANVAS_ERROR_NAMES = "CANVAS_ERROR",
  ) {
    super();
    this.name = name;
    this.message = message;
  }
}

export class AbortError extends DOMException {
  constructor(message: string = "Request Aborted") {
    super(message, "AbortError");
  }
}

type ImageSceneDataErrorCode =
  | "IMAGE_NOT_CONTAINS_SCENE_DATA"
  | "IMAGE_SCENE_DATA_ERROR";

export class ImageSceneDataError extends Error {
  public code;
  constructor(
    message = "Image Scene Data Error",
    code: ImageSceneDataErrorCode = "IMAGE_SCENE_DATA_ERROR",
  ) {
    super(message);
    this.name = "EncodingError";
    this.code = code;
  }
}

type WorkerErrorCodes = "WORKER_URL_NOT_DEFINED" | "WORKER_IN_THE_MAIN_CHUNK";

export class WorkerUrlNotDefinedError extends Error {
  public code;
  constructor(
    message = "Worker URL is not defined!",
    code: WorkerErrorCodes = "WORKER_URL_NOT_DEFINED",
  ) {
    super(message);
    this.name = "WorkerUrlNotDefinedError";
    this.code = code;
  }
}

export class WorkerInTheMainChunkError extends Error {
  public code;
  constructor(
    message = "Worker has to be in a separate chunk!",
    code: WorkerErrorCodes = "WORKER_IN_THE_MAIN_CHUNK",
  ) {
    super(message);
    this.name = "WorkerInTheMainChunkError";
    this.code = code;
  }
}

/**
 * Use this for generic, handled errors, so you can check against them
 * and rethrow if needed
 */
export class ExcalidrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcalidrawError";
  }
}

export class RequestError extends Error {
  public status: number;
  public data: any;
  toObject() {
    return { name: this.name, status: this.status, message: this.message };
  }
  constructor({
    message = "Something went wrong",
    status = 500,
    data,
  }: { message?: string; status?: number; data?: any } = {}) {
    super();
    this.name = "RequestError";
    this.message = message;
    this.status = status;
    this.data = data;
  }
}

const DEFAULT_ERROR_MESSAGE =
  "Ocurrió un error inesperado. Inténtalo de nuevo.";

const TECHNICAL_ERROR_MESSAGE =
  "Ocurrió un error técnico. Inténtalo de nuevo o contacta al administrador.";

const SPANISH_TEXT_REGEX =
  /[áéíóúüñ¿¡]|\b(?:acción|archivo|cargar|comentario|conexión|correo|datos|eliminar|error|guardar|inicia|intenta|no|permiso|recurso|sesión|tablero|usuario|válido)\b/i;

const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [
    /unable to validate email address|email address.*invalid|invalid.*email/i,
    "El correo electrónico no tiene un formato válido.",
  ],
  [
    /invalid login|invalid credentials|invalid grant|bad credentials/i,
    "Correo o contraseña incorrectos.",
  ],
  [
    /email not confirmed|not confirmed/i,
    "Confirma tu correo electrónico antes de iniciar sesión.",
  ],
  [
    /user already registered|already registered|already exists|duplicate/i,
    "Ya existe un registro con esos datos.",
  ],
  [
    /password.*(at least|minimum|too short)|weak password|password should/i,
    "La contraseña no cumple con los requisitos mínimos.",
  ],
  [
    /signup disabled|signups? not allowed|registration disabled/i,
    "El registro está deshabilitado.",
  ],
  [
    /rate limit|too many requests|security purposes|over_email_send_rate_limit/i,
    "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  ],
  [
    /jwt.*expired|token.*expired|expired jwt|session.*expired/i,
    "Tu sesión expiró. Inicia sesión de nuevo.",
  ],
  [
    /invalid jwt|invalid token|jwt.*invalid|malformed jwt/i,
    "La sesión no es válida. Inicia sesión de nuevo.",
  ],
  [
    /auth session missing|session not found|no session|missing session/i,
    "No hay una sesión activa. Inicia sesión de nuevo.",
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i,
    "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
  ],
  [
    /permission denied|row-level security|row level security|not allowed|unauthorized|forbidden|access denied/i,
    "No tienes permisos para realizar esta acción.",
  ],
  [
    /not authenticated|unauthenticated|authentication required/i,
    "No has iniciado sesión.",
  ],
  [
    /not found|does not exist|resource missing|object not found/i,
    "No se encontró el recurso solicitado.",
  ],
  [
    /invalid input syntax|invalid format|malformed|syntax error/i,
    "Los datos enviados no tienen un formato válido.",
  ],
  [
    /foreign key constraint|violates.*constraint/i,
    "No se puede completar la acción porque los datos relacionados no son válidos.",
  ],
  [/not-null constraint|null value/i, "Faltan datos obligatorios."],
  [
    /bucket not found|storage bucket/i,
    "No se encontró el almacenamiento de archivos configurado.",
  ],
  [
    /file.*too large|payload too large|size exceeded|is longer than.*bytes/i,
    "El archivo es demasiado grande.",
  ],
  [/request aborted|aborted/i, "La solicitud fue cancelada."],
  [/invalid origin/i, "El origen de la solicitud no es válido."],
  [/jwt is missing|missing jwt/i, "Falta el token de autorización."],
  [/failed to verify jwt/i, "No se pudo validar la autorización."],
  [/failed to export scene data/i, "No se pudo exportar la escena."],
  [
    /something went wrong|unexpected error|internal server error/i,
    DEFAULT_ERROR_MESSAGE,
  ],
];

const isObjectWithErrorFields = (
  value: unknown,
): value is {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  name?: unknown;
} => typeof value === "object" && value !== null;

const stringifyError = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (isObjectWithErrorFields(error)) {
    return [
      error.message,
      error.code,
      error.details,
      error.hint,
      error.status,
      error.name,
    ]
      .filter((value): value is string | number => {
        return typeof value === "string" || typeof value === "number";
      })
      .map(String)
      .join(" ");
  }

  return "";
};

export const translateErrorMessage = (
  message: string | null | undefined,
  fallback = DEFAULT_ERROR_MESSAGE,
): string => {
  const normalizedMessage = (message ?? "").trim();

  if (!normalizedMessage || normalizedMessage === "[object Object]") {
    return fallback;
  }

  for (const [pattern, translatedMessage] of ERROR_TRANSLATIONS) {
    if (pattern.test(normalizedMessage)) {
      return translatedMessage;
    }
  }

  if (SPANISH_TEXT_REGEX.test(normalizedMessage)) {
    return normalizedMessage;
  }

  return TECHNICAL_ERROR_MESSAGE;
};

export const getErrorMessage = (
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string => translateErrorMessage(stringifyError(error), fallback);
