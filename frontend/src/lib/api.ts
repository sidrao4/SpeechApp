// just a thin fetch wrapper, didn't feel like pulling in axios/react-query
// for this small an api surface

// all requests go to the same origin the page came from. Vercel (and the
// Vite dev proxy locally) forwards /api/* to the backend, which keeps the
// auth cookies first-party and means no CORS
export interface User {
  id: number
  username: string
}

export interface Script {
  id: number
  user_id: number
  text: string
  word_count: number
  est_read_time_seconds: number
  created_at: string
}

export interface PracticeSession {
  id: number
  script_id: number
  user_id: number
  started_at: string
  ended_at: string
  words_completed: number
  total_words: number
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function send(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
}

async function toError(response: Response, path: string, method: string): Promise<ApiError> {
  const body = await response.json().catch(() => null)
  const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
  // FastAPI validation errors come back as a list, grab the first message
  const message = Array.isArray(detail)
    ? String(detail[0]?.msg ?? 'Invalid input').replace(/^Value error, /, '')
    : detail
      ? String(detail)
      : `${method} ${path} failed: ${response.status}`
  return new ApiError(message, response.status)
}

// one refresh in flight at a time: if several requests 401 at once they all
// wait on the same refresh instead of each rotating the token (which would
// look like token reuse and log the user out)
let refreshing: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshing ??= send('/api/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response = await send(path, options)

  // access token expired (15 min) -> swap the refresh token for a new pair
  // and retry once. auth routes are skipped so a failed login can't loop
  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) {
      response = await send(path, options)
    }
  }

  if (!response.ok) {
    throw await toError(response, path, options?.method ?? 'GET')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

// ---------- auth ----------

export function register(username: string, password: string): Promise<User> {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function login(username: string, password: string): Promise<User> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' })
}

// restores a session on page load. the access cookie may have expired while
// the tab was closed, so try a refresh before giving up
export async function currentUser(): Promise<User | null> {
  let response = await send('/api/auth/me')
  if (response.status === 401 && (await refreshSession())) {
    response = await send('/api/auth/me')
  }
  return response.ok ? ((await response.json()) as User) : null
}

export function authProviders(): Promise<{ google: boolean }> {
  return request('/api/auth/providers')
}

// full-page navigation, not fetch: the browser has to follow the redirect to
// Google and back
export const GOOGLE_LOGIN_URL = '/api/auth/google/login'

// ---------- scripts & sessions ----------
// no user id anywhere below: the backend reads who you are from the cookie

export function listScripts(): Promise<Script[]> {
  return request('/api/scripts')
}

export function createScript(text: string): Promise<Script> {
  return request('/api/scripts', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function getScript(id: number): Promise<Script> {
  return request(`/api/scripts/${id}`)
}

export function createSession(session: {
  scriptId: number
  startedAt: string
  endedAt: string
  wordsCompleted: number
  totalWords: number
}): Promise<PracticeSession> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      script_id: session.scriptId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      words_completed: session.wordsCompleted,
      total_words: session.totalWords,
    }),
  })
}

export function listSessions(scriptId: number): Promise<PracticeSession[]> {
  return request(`/api/scripts/${scriptId}/sessions`)
}

export type ScriptLength = 'short' | 'medium' | 'long'

export function generateScript(prompt: string, length: ScriptLength): Promise<{ text: string }> {
  return request('/api/generate-script', {
    method: 'POST',
    body: JSON.stringify({ prompt, length }),
  })
}
