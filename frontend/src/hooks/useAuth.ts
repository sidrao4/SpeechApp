import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { User } from '../lib/api'

const STORAGE_KEY = 'speechapp.user'

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

// Login here just means "the browser remembers a user id" — there's no
// password, so there's no secret a real session would be protecting. See
// the backend's /api/login for the matching find-or-create logic.
export function useAuth() {
  const [user, setUser] = useState<User | null>(() => loadStoredUser())

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [user])

  const login = useCallback(async (username: string) => {
    const loggedInUser = await api.login(username)
    setUser(loggedInUser)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  return { user, login, logout }
}
