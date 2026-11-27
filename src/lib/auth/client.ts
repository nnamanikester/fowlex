/** Calls the app's API from the browser. Errors come back as { status, code, message, field? }. */
export type AuthError = { status: number; code: string; message: string; field?: string; details?: unknown };

/** How long a read may take before we say so; changes are left to finish, so nothing is sent twice. */
export const READ_TIMEOUT_MS = 30_000;

/** What to tell someone when the server didn't say: plain words for each kind of trouble. */
export function fallbackMessage(status: number): string {
  if (status === 401) return "You've been signed out. Sign in again to carry on.";
  if (status === 403) return "Your role can't do this. Ask an owner.";
  if (status === 404) return "We couldn't find that. It may have been removed: refresh the page.";
  if (status === 409) return "Someone else changed this just now. Refresh the page and try again.";
  if (status === 413) return "That's too big to send. Try a smaller file.";
  if (status === 429) return "That's a lot of tries. Wait a minute, then try again.";
  if (status >= 500) return "Fowlex had a problem. Try again in a moment.";
  return "Something went wrong. Try again in a moment.";
}

export async function authRequest<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...(method === "GET" && { signal: AbortSignal.timeout(READ_TIMEOUT_MS) }),
    });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError")
      throw { status: 0, code: "timeout", message: "Fowlex is taking too long to answer. Try again." };
    throw { status: 0, code: "network", message: "Can't reach Fowlex. Check your connection and try again." };
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw {
      status: response.status,
      code: data?.error?.code ?? "unknown",
      message: data?.error?.message ?? fallbackMessage(response.status),
      field: data?.error?.field,
      details: data?.error?.details,
    } satisfies AuthError;
  return data as T;
}

/** The same call, for any API. */
export const apiRequest = authRequest;

/** Any thrown thing as an AuthError, so a screen always has words to show. */
export function asProblem(e: unknown): AuthError {
  if (e && typeof e === "object" && typeof (e as AuthError).message === "string" && "status" in e)
    return e as AuthError;
  return { status: 0, code: "unknown", message: fallbackMessage(0) };
}
