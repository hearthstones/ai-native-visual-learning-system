export type ThemeType = 'general' | 'tech'
export type ThemePhase = 'learning' | 'practice' | 'application'
export type ThemeStatus = 'draft' | 'active' | 'dormant' | 'archived'
export type CocreateKind = 'stage' | 'resources' | 'plan'

export interface Theme {
  id: string
  title: string
  theme_type: ThemeType
  goal: string
  phase: ThemePhase
  status: ThemeStatus
  is_focus: boolean
  current_ladder_level: number | null
  ladder_doc: Record<string, unknown>
  resources_doc: Record<string, unknown>
  created_at: string
  updated_at: string
  locked_at: string | null
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
}

export interface HomeData {
  slots: Record<string, { used: number; max: number }>
  focus_count: number
  themes: Theme[]
  today_tasks: DailyTask[]
  drift_events: Array<{
    id: string
    kind: string
    message: string
    theme_id: string | null
    created_at: string
  }>
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

export interface SliceActivity {
  id: string
  title: string
  description: string
  activity_type: string | null
  done: boolean
  sort_order: number
}

export interface ActiveSlice {
  id: string | null
  theme_id: string
  phase: ThemePhase | null
  title: string
  core_points: unknown[]
  activities: SliceActivity[]
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
}

export interface LlmSettingsUpdate {
  deepseek_api_key?: string
  deepseek_base_url?: string
  deepseek_model?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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

export const api = {
  health: () =>
    request<{ ok: boolean; deepseek_configured: boolean; weread_configured: boolean; model?: string }>(
      '/api/health',
    ),
  getSettings: () => request<LlmSettings>('/api/settings'),
  updateSettings: (body: LlmSettingsUpdate) =>
    request<LlmSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  home: () => request<HomeData>('/api/home'),
  slots: () => request<Record<string, { used: number; max: number }>>('/api/slots'),
  createTheme: (body: { title: string; theme_type: ThemeType; goal?: string }) =>
    request<Theme>('/api/themes', { method: 'POST', body: JSON.stringify(body) }),
  getTheme: (id: string) => request<Theme>(`/api/themes/${id}`),
  updateTheme: (
    id: string,
    body: Partial<Pick<Theme, 'title' | 'goal' | 'status' | 'is_focus' | 'current_ladder_level'>>,
  ) => request<Theme>(`/api/themes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  advancePhase: (id: string) =>
    request<Theme>(`/api/themes/${id}/advance-phase`, { method: 'POST' }),
  startCocreate: (themeId: string, kind: CocreateKind, options: StartCocreateOptions = {}) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/start`, {
      method: 'POST',
      body: JSON.stringify({ kind, ...options }),
    }),
  getCocreate: (themeId: string, kind: CocreateKind) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/${kind}`),
  messageCocreate: (themeId: string, kind: CocreateKind, content: string) =>
    request<CocreateSession>(`/api/themes/${themeId}/cocreate/${kind}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
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
  getActiveSlice: (themeId: string) =>
    request<ActiveSlice>(`/api/themes/${themeId}/active-slice`),
  toggleActivity: (activityId: string, done: boolean) =>
    request<SliceActivity>(`/api/themes/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  createWeeklyReview: (body: WeeklyReviewInput = {}) =>
    request<WeeklyReview>('/api/reviews/weekly', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  latestWeeklyReview: () => request<WeeklyReview | null>('/api/reviews/weekly/latest'),
}
