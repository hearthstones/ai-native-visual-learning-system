import { Navigate, useParams, useSearchParams } from 'react-router-dom'

/**
 * 兼容旧作业面路由：重定向到主题看板对应区块。
 * `/themes/:id/work?mode=plan|review|execute` → `/themes/:id?mode=...`
 */
export function ThemeWorkPage() {
  const { themeId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const next = new URLSearchParams()
  next.set('mode', mode === 'plan' || mode === 'review' ? mode : 'execute')
  return <Navigate to={`/themes/${themeId}?${next.toString()}`} replace />
}
