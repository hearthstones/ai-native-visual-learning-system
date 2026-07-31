import type { ActiveSlice, Theme, ThemePhase } from './api'

export interface LadderLevel {
  level: number
  name: string
  understand?: string
  mastery?: string
  concepts?: string[]
  milestone?: string
  exercise?: string
  self_check?: string
}

export const phaseZh: Record<ThemePhase, string> = {
  learning: '学习期',
  practice: '练习期',
  application: '应用期',
}

export function getLadderLevels(theme: Theme | null | undefined): LadderLevel[] {
  const raw = theme?.ladder_doc?.levels
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is LadderLevel => !!x && typeof x === 'object')
}

export function getSelectedLevel(theme: Theme | null | undefined): number | null {
  if (typeof theme?.current_ladder_level === 'number') return theme.current_ladder_level
  const fromDoc = theme?.ladder_doc?.selected_level
  return typeof fromDoc === 'number' ? fromDoc : null
}

/** 核心概念：优先当前级别，不足时补全其它级别，最多 5 条 */
export function getCoreConcepts(theme: Theme | null | undefined, max = 5): string[] {
  const levels = getLadderLevels(theme)
  if (!levels.length) return theme?.goal ? [theme.goal] : []

  const selected = getSelectedLevel(theme)
  const ordered = selected
    ? [
        ...levels.filter((l) => l.level === selected),
        ...levels.filter((l) => l.level !== selected),
      ]
    : levels

  const out: string[] = []
  for (const level of ordered) {
    for (const c of level.concepts || []) {
      if (c && !out.includes(c)) out.push(c)
      if (out.length >= max) return out
    }
  }
  return out
}

export function getCurrentLevel(theme: Theme | null | undefined): LadderLevel | null {
  const levels = getLadderLevels(theme)
  if (!levels.length) return null
  const selected = getSelectedLevel(theme)
  return levels.find((l) => l.level === selected) || levels[0] || null
}

/** 计划切片条目：优先用锁定后的活动列表 */
export function getSliceItems(
  slice: ActiveSlice | null | undefined,
  theme?: Theme | null,
): Array<{ id: string; label: string; desc: string; done?: boolean; activityId?: string }> {
  if (slice?.activities?.length) {
    return slice.activities.map((a) => ({
      id: a.id,
      activityId: a.id,
      label: a.title,
      desc: a.description || (a.activity_type ? `活动 · ${a.activity_type}` : slice.title || '计划活动'),
      done: a.done,
    }))
  }
  if (slice?.core_points?.length) {
    return slice.core_points.map((p, i) => ({
      id: `core-${i}`,
      label: typeof p === 'string' ? p : JSON.stringify(p),
      desc: '核心要点',
    }))
  }
  // 尚未锁定计划时，仅回退主题目标，不再用阶梯条目冒充计划
  return theme?.goal
    ? [{ id: 'goal', label: theme.goal, desc: '主题目标（计划未锁定）' }]
    : []
}
