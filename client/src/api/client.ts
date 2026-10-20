import type { FieldError } from '@aqualims/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: FieldError[],
  ) {
    super(message);
  }
}

type Listener = (error: ApiError) => void;
const sessionListeners = new Set<Listener>();

// Lets the auth layer react to expired sessions / forced password changes from any request.
export function onSessionProblem(listener: Listener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let payload: any = {};
  try {
    payload = await res.json();
  } catch {
    payload = { message: res.statusText };
  }
  const error = new ApiError(res.status, payload.message ?? 'Request failed.', payload.code, Array.isArray(payload.details) ? payload.details : undefined);
  if (res.status === 401 || payload.code === 'PASSWORD_CHANGE_REQUIRED') sessionListeners.forEach((l) => l(error));
  throw error;
}

export async function download(path: string, body: unknown, fileName: string): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = 'Export failed.';
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
