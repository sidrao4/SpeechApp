import { useCallback, useEffect, useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Teleprompter } from './components/Teleprompter'
import { useAuth } from './hooks/useAuth'
import * as api from './lib/api'
import type { Script, ScriptLength } from './lib/api'

type Screen = 'setup' | 'prompter'

interface StartOptions {
  // pasted text auto-saves on start like before. generated text doesn't -
  // that's only ever saved if you hit the save button, stays temporary
  // otherwise
  autoSave: boolean
  scriptId: number | null
}

function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [script, setScript] = useState('')
  const [scriptId, setScriptId] = useState<number | null>(null)
  // bumping this remounts Teleprompter from scratch (new cursor, new mic
  // session, etc) - easiest way to fully reset on restart
  const [attempt, setAttempt] = useState(0)

  const { user, login, logout } = useAuth()
  const [scripts, setScripts] = useState<Script[]>([])

  const refreshScripts = useCallback(async (userId: number) => {
    try {
      setScripts(await api.listScripts(userId))
    } catch {
      // history is a nice-to-have, if the backend's down the rest of the
      // app should still work fine
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
        // save failed, just let them practice with it locally anyway
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
