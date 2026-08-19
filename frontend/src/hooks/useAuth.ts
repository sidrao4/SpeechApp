import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { User } from '../lib/api'

const STORAGE_KEY = 'verbatim.user'

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

// "login" just means the browser remembers a user id, no password so
// there's no secret to actually protect. see /api/login on the backend
// for the find-or-create bit
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
