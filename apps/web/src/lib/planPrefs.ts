import type { PlanPrefs } from './api'

/**
 * 计划共创默认节奏。
 * 请与后端 `app/plan_defaults.py` / `schemas.PlanPrefs` 保持一致。
 */
export const DEFAULT_PLAN_PREFS: PlanPrefs = {
  learning_duration: '约 1–2 周',
  practice_duration: '约 4 周',
  application_duration: '长尾',
  daily_minutes: 30,
}

export function applyDurationsToPrefs(
  liveDoc: Record<string, unknown>,
  prev: PlanPrefs = DEFAULT_PLAN_PREFS,
): PlanPrefs {
  const durations = liveDoc.durations as
    | { learning?: string; practice?: string; application?: string }
    | undefined
  return {
    learning_duration: durations?.learning || prev.learning_duration,
    practice_duration: durations?.practice || prev.practice_duration,
    application_duration: durations?.application || prev.application_duration,
    daily_minutes: Number(liveDoc.daily_minutes) || prev.daily_minutes,
  }
}
