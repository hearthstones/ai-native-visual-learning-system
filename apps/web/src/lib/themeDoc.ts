import type { Theme, ThemePhase } from './api'

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

/** 计划切片条目：来自当前级别的练习 / 里程碑 / 概念 */
export function getSliceItems(
  theme: Theme | null | undefined,
): Array<{ id: string; label: string; desc: string }> {
  const level = getCurrentLevel(theme)
  if (!level) {
    return theme?.goal
      ? [{ id: 'goal', label: theme.goal, desc: '主题目标' }]
      : []
  }
  const items: Array<{ id: string; label: string; desc: string }> = []
  if (level.exercise) {
    items.push({ id: 'exercise', label: level.exercise, desc: `L${level.level} · 练习` })
  }
  if (level.milestone) {
    items.push({ id: 'milestone', label: level.milestone, desc: `L${level.level} · 里程碑` })
  }
  for (const [i, c] of (level.concepts || []).entries()) {
    items.push({ id: `c-${i}`, label: c, desc: `L${level.level} · 核心概念` })
  }
  if (!items.length && level.name) {
    items.push({
      id: 'level',
      label: level.name,
      desc: level.understand || `L${level.level}`,
    })
  }
  return items
}

export function coreStatus(index: number, total: number, selectedLevel: number | null) {
  // 无掌握度 API：按已选定级别粗分状态，仅供展示
  const progress = selectedLevel ? Math.min(selectedLevel / Math.max(total, 1), 1) : 0.4
  const doneUntil = Math.floor(total * progress)
  if (index < doneUntil - 1) return { status: 'done' as const, label: '已掌握' }
  if (index === doneUntil - 1 || index === doneUntil) {
    return { status: 'good' as const, label: '良好', current: index === doneUntil }
  }
  return { status: 'weak' as const, label: '待加强' }
}
