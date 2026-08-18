// Thin fetch wrapper for the backend. Plain fetch rather than a library —
// the frontend has exactly two runtime dependencies (react, react-dom) and
// this API surface is small enough not to need axios/react-query.

const API_URL = import.meta.env.VITE_API_URL

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function login(username: string): Promise<User> {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ username }) })
}

export function listScripts(userId: number): Promise<Script[]> {
  return request(`/api/scripts?user_id=${userId}`)
}

export function createScript(userId: number, text: string): Promise<Script> {
  return request('/api/scripts', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, text }),
  })
}

export function getScript(id: number): Promise<Script> {
  return request(`/api/scripts/${id}`)
}

export function createSession(session: {
  scriptId: number
  userId: number
  startedAt: string
  endedAt: string
  wordsCompleted: number
  totalWords: number
}): Promise<PracticeSession> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      script_id: session.scriptId,
      user_id: session.userId,
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
