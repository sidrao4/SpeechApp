import { useCallback, useEffect, useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Teleprompter } from './components/Teleprompter'
import { useAuth } from './hooks/useAuth'
import * as api from './lib/api'
import type { Script } from './lib/api'

type Screen = 'setup' | 'prompter'

function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [script, setScript] = useState('')
  const [scriptId, setScriptId] = useState<number | null>(null)
  // Bumping this remounts Teleprompter from scratch — fresh cursor, fresh
  // mic session, fresh matching state — which is the cleanest way to
  // fully reset it on restart.
  const [attempt, setAttempt] = useState(0)

  const { user, login, logout } = useAuth()
  const [scripts, setScripts] = useState<Script[]>([])

  const refreshScripts = useCallback(async (userId: number) => {
    try {
      setScripts(await api.listScripts(userId))
    } catch {
      // History is a nice-to-have, not a blocker — if the backend isn't
      // reachable, the rest of the app still needs to work.
    }
  }, [])

  useEffect(() => {
    if (user) {
      refreshScripts(user.id)
    } else {
      setScripts([])
    }
  }, [user, refreshScripts])

  async function handleStartFromText(text: string) {
    setScriptId(null)
    if (user) {
      try {
        const created = await api.createScript(user.id, text)
        setScriptId(created.id)
        setScripts((prev) => [created, ...prev])
      } catch {
        // Couldn't save it — still let them practice with it locally.
      }
    }
    setScript(text)
    setScreen('prompter')
  }

  function handleSelectScript(selected: Script) {
    setScriptId(selected.id)
    setScript(selected.text)
    setScreen('prompter')
  }

  if (screen === 'prompter') {
    return (
      <Teleprompter
        key={attempt}
        script={script}
        userId={user?.id ?? null}
        scriptId={scriptId}
        onExit={() => setScreen('setup')}
        onRestart={() => setAttempt((a) => a + 1)}
      />
    )
  }

  return (
    <SetupScreen
      user={user}
      onLogin={login}
      onLogout={logout}
      scripts={scripts}
      onSelectScript={handleSelectScript}
      onStart={handleStartFromText}
    />
  )
}

export default App
