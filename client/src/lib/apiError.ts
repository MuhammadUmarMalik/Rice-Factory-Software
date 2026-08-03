/**
 * Turns a failed Response into an Error carrying a human-readable message.
 *
 * The API returns errors as `{ error: "..." }` (controllers) or
 * `{ message: "..." }` (the global express error handler). Without this the UI
 * surfaced raw payloads such as `401: {"error":"Invalid credentials"}` in
 * toasts.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function extractErrorMessage(status: number, body: string, statusText?: string): string {
  const trimmed = (body || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const message = parsed?.error ?? parsed?.message;
      if (typeof message === "string" && message.trim()) return message.trim();
    } catch {
      // Fall through to the raw body below.
    }
  }
  if (trimmed && !trimmed.startsWith("<")) return trimmed;
  if (statusText) return statusText;
  return `Request failed (${status})`;
}

export async function toApiError(res: Response): Promise<ApiError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }
  return new ApiError(extractErrorMessage(res.status, body, res.statusText), res.status, body);
}
