import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { User } from '../lib/api'

// the session lives in httpOnly cookies the page can't read, so there's
// nothing to keep in localStorage. on load, ask the backend who we are
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [redirectError, setRedirectError] = useState<string | null>(null)

  useEffect(() => {
    api
      .currentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false))

    api
      .authProviders()
      .then((p) => setGoogleEnabled(p.google))
      .catch(() => setGoogleEnabled(false))

    // the Google callback sends failures back as ?auth_error=google
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth_error')) {
      setRedirectError('Google sign-in failed — try again.')
      params.delete('auth_error')
      const query = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setUser(await api.login(username, password))
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    setUser(await api.register(username, password))
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const loginWithGoogle = useCallback(() => {
    window.location.assign(api.GOOGLE_LOGIN_URL)
  }, [])

  return { user, checking, googleEnabled, redirectError, login, register, logout, loginWithGoogle }
}
