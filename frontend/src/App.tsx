import { useCallback, useEffect, useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Teleprompter } from './components/Teleprompter'
import { useAuth } from './hooks/useAuth'
import * as api from './lib/api'
import type { Script, ScriptLength } from './lib/api'

type Screen = 'setup' | 'prompter'

interface StartOptions {
  // Pasted text auto-saves on start (existing behavior). Generated text
  // never does — saving it is only ever explicit, via the dedicated save
  // button, so it stays truly temporary unless you opt in.
  autoSave: boolean
  scriptId: number | null
}

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

  async function handleStartFromText(text: string, options: StartOptions) {
    let usedScriptId = options.scriptId
    if (user && options.autoSave && usedScriptId === null) {
      try {
        const created = await api.createScript(user.id, text)
        usedScriptId = created.id
        setScripts((prev) => [created, ...prev])
      } catch {
        // Couldn't save it — still let them practice with it locally.
      }
    }
    setScriptId(usedScriptId)
    setScript(text)
    setScreen('prompter')
  }

  function handleSelectScript(selected: Script) {
    setScriptId(selected.id)
    setScript(selected.text)
    setScreen('prompter')
  }

  function handleGenerateScript(prompt: string, length: ScriptLength) {
    return api.generateScript(prompt, length)
  }

  async function handleSaveScript(text: string): Promise<Script | null> {
    if (!user) return null
    try {
      const created = await api.createScript(user.id, text)
      setScripts((prev) => [created, ...prev])
      return created
    } catch {
      return null
    }
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
      onGenerateScript={handleGenerateScript}
      onSaveScript={handleSaveScript}
    />
  )
}

export default App
