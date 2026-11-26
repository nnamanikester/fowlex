/** Calls the app's API from the browser. Errors come back as { status, code, message, field? }. */
export type AuthError = { status: number; code: string; message: string; field?: string; details?: unknown };

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
    });
  } catch {
    throw { status: 0, code: "network", message: "Can't reach Fowlex. Check your connection and try again." };
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw {
      status: response.status,
      code: data?.error?.code ?? "unknown",
      message: data?.error?.message ?? "Something went wrong. Try again in a moment.",
      field: data?.error?.field,
      details: data?.error?.details,
    } satisfies AuthError;
  return data as T;
}

/** The same call, for any API. */
export const apiRequest = authRequest;
