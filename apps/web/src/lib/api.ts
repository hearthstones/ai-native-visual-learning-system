export type ThemeType = 'general' | 'tech'
export type ThemePhase = 'learning' | 'practice' | 'application'
export type ThemeStatus =
  | 'draft'
  | 'active'
  | 'dormant'
  | 'completed'
  | 'abandoned'
  | 'archived'
  | 'deleted'
export type CocreateKind = 'stage' | 'resources' | 'plan'

export interface Theme {
  id: string
  title: string
  theme_type: ThemeType
  goal: string
  phase: ThemePhase
  status: ThemeStatus
  is_focus: boolean
  previous_status?: ThemeStatus | null
  current_ladder_level: number | null
  ladder_doc: Record<string, unknown>
  resources_doc: Record<string, unknown>
  work_note?: string
  created_at: string
  updated_at: string
  locked_at: string | null
}

export interface ExecutionSummary {
  expanded: boolean
  goal?: string | null
  next_step?: string | null
  steps_done: number
  steps_total: number
  minutes?: number | null
}

export interface DailyTask {
  id: string
  theme_id: string
  activity_id: string | null
  title: string
  description: string
  task_date: string
  done: boolean
  sort_order: number
  execution_summary?: ExecutionSummary | null
}

export interface HomeData {
  slots: Record<string, { used: number; max: number }>
  focus_count: number
  themes: Theme[]
  today_tasks: DailyTask[]
  queue?: QueueItem[]
  drift_events: Array<{
    id: string
    kind: string
    message: string
    theme_id: string | null
    created_at: string
  }>
}

export interface QueueItem {
  activity_id: string
  theme_id: string
  theme_title: string
  phase: ThemePhase
  title: string
  description: string
  execution_summary?: ExecutionSummary | null
}

export interface CocreateSession {
  id: string
  theme_id: string
  kind: CocreateKind
  messages: Array<{ role: string; content: string }>
  live_doc: Record<string, unknown>
  confirmed: boolean
}

export interface WeeklyReview {
  id: string
  week_start: string
  summary: string
  wins: unknown[]
  issues: unknown[]
  adjustments: unknown[]
}

export interface ExecutionStep {
  id: string
  text: string
  done: boolean
}

export interface ExecutionDoc {
  goal?: string
  steps?: ExecutionStep[]
  resource_ref?: { index?: number | null; name?: string } | null
  outcome?: string
  minutes?: number
  messages?: Array<{ role: string; content: string }>
  updated_at?: string | null
}

export interface SliceActivity {
  id: string
  title: string
  description: string
  activity_type: string | null
  done: boolean
  sort_order: number
  execution_doc?: ExecutionDoc
}

export interface ActiveSlice {
  id: string | null
  theme_id: string
  phase: ThemePhase | null
  title: string
  core_points: unknown[]
  activities: SliceActivity[]
  daily_minutes?: number
}

export interface PlanDocument {
  theme: Theme
  plan_doc: Record<string, unknown>
  locked: boolean
}

export interface WeeklyReviewInput {
  answers?: string[]
  mastery?: Array<{ name: string; score: number }>
  draft_notes?: string
}

export interface PlanPrefs {
  learning_duration: string
  practice_duration: string
  application_duration: string
  daily_minutes: number
}

export interface StartCocreateOptions {
  resource_count?: number
  plan_prefs?: PlanPrefs
  force?: boolean
}

export interface LlmSettings {
  provider: string
  deepseek_api_key_configured: boolean
  deepseek_api_key_masked: string
  deepseek_base_url: string
  deepseek_model: string
  model_options: Array<{ value: string; label: string }>
  weread_configured: boolean
  weread_api_key_masked?: string
}

export interface LlmSettingsUpdate {
  deepseek_api_key?: string
  deepseek_base_url?: string
  deepseek_model?: string
  weread_api_key?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type CocreateStreamHandlers = {
  onStatus?: (data: { phase?: string; kind?: string }) => void
  onDelta?: (text: string) => void
  onLiveDoc?: (doc: Record<string, unknown>) => void
  onSession?: (session: CocreateSession) => void
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/)
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n') }
}

async function streamCocreateRequest(
  path: string,
  body: unknown,
  handlers: CocreateStreamHandlers = {},
): Promise<CocreateSession> {
  const res = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const errBody = await res.json()
      detail = errBody.detail || JSON.stringify(errBody)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (!res.body) throw new Error('浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let session: CocreateSession | null = null
  let streamError: string | null = null

  const handleBlock = (raw: string) => {
    const parsed = parseSseBlock(raw)
    if (!parsed) return
    let payload: unknown = parsed.data
    try {
      payload = JSON.parse(parsed.data)
    } catch {
      /* keep raw string */
    }
    if (parsed.event === 'status' && payload && typeof payload === 'object') {
      handlers.onStatus?.(payload as { phase?: string; kind?: string })
      return
    }
    if (parsed.event === 'delta' && payload && typeof payload === 'object') {
      const text = String((payload as { text?: string }).text || '')
      if (text) handlers.onDelta?.(text)
      return
    }
    if (parsed.event === 'live_doc' && payload && typeof payload === 'object') {
      handlers.onLiveDoc?.(payload as Record<string, unknown>)
      return
    }
    if (parsed.event === 'session' && payload && typeof payload === 'object') {
      session = payload as CocreateSession
      handlers.onSession?.(session)
      return
    }
    if (parsed.event === 'error') {
      const detail =
        payload && typeof payload === 'object'
          ? String((payload as { detail?: string }).detail || JSON.stringify(payload))
          : String(payload)
      streamError = detail
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')
    let sep = buffer.indexOf('\n\n')
    while (sep >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      if (block.trim()) handleBlock(block)
      sep = buffer.indexOf('\n\n')
    }
  }
  if (buffer.trim()) handleBlock(buffer)

  if (streamError) throw new Error(streamError)
  if (!session) throw new Error('流式共创未返回会话')
  return session
}

export const api = {
  health: () =>
    request<{ ok: boolean; deepseek_configured: boolean; weread_configured: boolean; model?: string }>(
      '/api/health',
    ),
  getSettings: () => request<LlmSettings>('/api/settings'),
  updateSettings: (body: LlmSettingsUpdate) =>
    request<LlmSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  testLlm: () =>
    request<{ ok: boolean; model: string; models?: string[]; echo: unknown }>(
      '/api/settings/test-llm',
      {
        method: 'POST',
        body: '{}',
      },
    ),
  home: () => request<HomeData>('/api/home'),
  slots: () => request<Record<string, { used: number; max: number }>>('/api/slots'),
  commitToday: (activityId: string) =>
    request<DailyTask>('/api/commitments', {
      method: 'POST',
      body: JSON.stringify({ activity_id: activityId }),
    }),
  uncommitToday: (taskId: string) =>
    request<void>(`/api/commitments/${taskId}`, { method: 'DELETE' }),
  suggestCommitments: (themeId?: string) =>
    request<DailyTask[]>('/api/commitments/suggest', {
      method: 'POST',
      body: JSON.stringify(themeId ? { theme_id: themeId } : {}),
    }),
  listThemes: (status?: ThemeStatus) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    return request<Theme[]>(`/api/themes${q}`)
  },
  createTheme: (body: { title: string; theme_type: ThemeType; goal?: string }) =>
    request<Theme>('/api/themes', { method: 'POST', body: JSON.stringify(body) }),
  getTheme: (id: string) => request<Theme>(`/api/themes/${id}`),
  updateTheme: (
    id: string,
    body: Partial<
      Pick<Theme, 'title' | 'goal' | 'status' | 'is_focus' | 'current_ladder_level' | 'work_note'>
    >,
  ) => request<Theme>(`/api/themes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  restoreTheme: (id: string) =>
    request<Theme>(`/api/themes/${id}/restore`, { method: 'POST' }),
  purgeTheme: (id: string) =>
    request<void>(`/api/themes/${id}`, { method: 'DELETE' }),
  advancePhase: (id: string) =>
    request<Theme>(`/api/themes/${id}/advance-phase`, { method: 'POST' }),
  startCocreate: (themeId: string, kind: CocreateKind, options: StartCocreateOptions = {}) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/start`, {
      method: 'POST',
      body: JSON.stringify({ kind, ...options }),
    }),
  startCocreateStream: (
    themeId: string,
    kind: CocreateKind,
    options: StartCocreateOptions = {},
    handlers: CocreateStreamHandlers = {},
  ) =>
    streamCocreateRequest(
      `/api/themes/${themeId}/cocreate/start/stream`,
      { kind, ...options },
      handlers,
    ),
  getCocreate: (themeId: string, kind: CocreateKind) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/${kind}`),
  messageCocreate: (themeId: string, kind: CocreateKind, content: string) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/${kind}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  messageCocreateStream: (
    themeId: string,
    kind: CocreateKind,
    content: string,
    handlers: CocreateStreamHandlers = {},
  ) =>
    streamCocreateRequest(
      `/api/themes/${themeId}/cocreate/${kind}/message/stream`,
      { content },
      handlers,
    ),
  confirmCocreate: (
    themeId: string,
    kind: CocreateKind,
    body: { selected_level?: number; live_doc?: Record<string, unknown> } = {},
  ) =>
    request<Theme>(`/api/themes/${themeId}/cocreate/${kind}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  toggleTask: (taskId: string, done: boolean) =>
    request<DailyTask>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  getPlanDocument: (themeId: string) =>
    request<PlanDocument>(`/api/themes/${themeId}/plan-document`),
  getActiveSlice: (themeId: string) =>
    request<ActiveSlice>(`/api/themes/${themeId}/active-slice`),
  toggleActivity: (activityId: string, done: boolean) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  expandActivity: (activityId: string) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}/expand`, {
      method: 'POST',
      body: '{}',
    }),
  messageActivityExpand: (activityId: string, content: string) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}/expand/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  patchActivityExecution: (
    activityId: string,
    body: {
      goal?: string
      steps?: Array<{ id?: string; text: string; done?: boolean }>
      resource_ref?: { index?: number | null; name?: string } | null
      outcome?: string
      minutes?: number
      clear?: boolean
    },
  ) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}/execution`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  toggleExecutionStep: (activityId: string, stepId: string, done: boolean) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}/execution/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  createWeeklyReview: (body: WeeklyReviewInput = {}) =>
    request<WeeklyReview>('/api/reviews/weekly', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  latestWeeklyReview: () => request<WeeklyReview | null>('/api/reviews/weekly/latest'),
  searchWeread: (q: string) =>
    request<{ books: Array<Record<string, unknown>> }>(
      `/api/weread/search?q=${encodeURIComponent(q)}`,
    ),
}
