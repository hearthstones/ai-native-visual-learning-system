import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import '../styles/pages/login.css'

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.login(username.trim(), password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">刻意练习</h1>
        <p className="login-subtitle">输入配置文件中的账号密码后继续</p>
        <label className="login-field">
          <span>用户名</span>
          <input
            className="login-input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="login-field">
          <span>密码</span>
          <input
            className="login-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </label>
        {error ? <p className="login-error">{error}</p> : null}
        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? '验证中…' : '进入系统'}
        </button>
      </form>
    </div>
  )
}
