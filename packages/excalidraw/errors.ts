import { isLocalizedText, t } from "./i18n";

import type fallbackLangData from "./locales/en.json";

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

type ServerErrorKey = keyof typeof fallbackLangData.serverErrors;

const ERROR_TRANSLATIONS: Array<[RegExp, ServerErrorKey]> = [
  [/cannot change your own role/i, "cannotChangeOwnRole"],
  [/only administrators can change/i, "onlyAdminsCanChangeRole"],
  [/only the owner can close/i, "onlyOwnerCanClose"],
  [/not a member of this shared board/i, "notSharedBoardMember"],
  [
    /unable to validate email address|email address.*invalid|invalid.*email/i,
    "invalidEmail",
  ],
  [
    /invalid login|invalid credentials|invalid grant|bad credentials/i,
    "invalidCredentials",
  ],
  [/email not confirmed|not confirmed/i, "emailNotConfirmed"],
  [
    /already.*(verified|confirmed)|user.*already.*confirmed/i,
    "emailAlreadyVerified",
  ],
  [
    /user already registered|already registered|already exists|duplicate/i,
    "alreadyRegistered",
  ],
  [
    /password.*(at least|minimum|too short)|weak password|password should/i,
    "weakPassword",
  ],
  [
    /signup disabled|signups? not allowed|registration disabled/i,
    "signupDisabled",
  ],
  [
    /rate limit|too many requests|security purposes|over_email_send_rate_limit/i,
    "rateLimited",
  ],
  [/otp_expired|token.*expired|link.*expired|expired.*link/i, "linkExpired"],
  [/invalid.*token|invalid.*link|email.*link.*invalid/i, "linkInvalid"],
  [
    /jwt.*expired|token.*expired|expired jwt|session.*expired/i,
    "sessionExpired",
  ],
  [/invalid jwt|invalid token|jwt.*invalid|malformed jwt/i, "sessionInvalid"],
  [
    /auth session missing|session not found|no session|missing session/i,
    "noSession",
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i,
    "network",
  ],
  [
    /permission denied|row-level security|row level security|not allowed|unauthorized|forbidden|access denied/i,
    "permissionDenied",
  ],
  [
    /not authenticated|unauthenticated|authentication required/i,
    "notAuthenticated",
  ],
  [/not found|does not exist|resource missing|object not found/i, "notFound"],
  [
    /invalid input syntax|invalid format|malformed|syntax error/i,
    "invalidFormat",
  ],
  [/foreign key constraint|violates.*constraint/i, "constraintViolation"],
  [/not-null constraint|null value/i, "missingData"],
  [/bucket not found|storage bucket/i, "storageNotFound"],
  [
    /file.*too large|payload too large|size exceeded|is longer than.*bytes/i,
    "fileTooLarge",
  ],
  [/request aborted|aborted/i, "requestAborted"],
  [/invalid origin/i, "invalidOrigin"],
  [/jwt is missing|missing jwt/i, "missingToken"],
  [/failed to verify jwt/i, "tokenVerifyFailed"],
  [/failed to export scene data/i, "exportFailed"],
  [/database error saving new user/i, "createAccountFailed"],
  [
    /something went wrong|unexpected error|internal server error/i,
    "unexpected",
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
  fallback = t("serverErrors.unexpected"),
): string => {
  const normalizedMessage = (message ?? "").trim();

  if (!normalizedMessage || normalizedMessage === "[object Object]") {
    return fallback;
  }

  for (const [pattern, key] of ERROR_TRANSLATIONS) {
    if (pattern.test(normalizedMessage)) {
      return t(`serverErrors.${key}`);
    }
  }

  // already produced by t() in the current language
  if (isLocalizedText(normalizedMessage)) {
    return normalizedMessage;
  }

  return t("serverErrors.technical");
};

export const getErrorMessage = (
  error: unknown,
  fallback = t("serverErrors.unexpected"),
): string => translateErrorMessage(stringifyError(error), fallback);
