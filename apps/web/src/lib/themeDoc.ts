import type { ActiveSlice, Theme, ThemePhase } from './api'
import { DEFAULT_PLAN_PREFS } from './planPrefs'

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

function hasDocContent(doc: Record<string, unknown> | null | undefined): boolean {
  return !!doc && Object.keys(doc).length > 0
}

/** 草稿主题应续创的共创步骤路径 */
export function draftResumePath(theme: Theme): string {
  if (!hasDocContent(theme.ladder_doc) && theme.current_ladder_level == null) {
    return `/create/${theme.id}/stage`
  }
  if (!hasDocContent(theme.resources_doc)) {
    return `/create/${theme.id}/resources`
  }
  return `/create/${theme.id}/plan`
}

export function draftResumeLabel(theme: Theme): string {
  if (!hasDocContent(theme.ladder_doc) && theme.current_ladder_level == null) {
    return '继续阶梯共创'
  }
  if (!hasDocContent(theme.resources_doc)) {
    return '继续资料共创'
  }
  return '继续计划共创'
}

/** 计划切片条目：优先用锁定后的活动列表 */
const EMPTY_EXECUTION: import('./api').ExecutionDoc = {}

export function stripDayMarkers(text: string): string {
  return String(text || '')
    .replace(/[（(]?\s*第\s*\d+\s*(?:[-–—~到至]\s*\d+\s*)?天\s*[)）]?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[ ·\-—，,]+|[ ·\-—，,]+$/g, '')
    .trim()
}

/** 展示用：去掉「第N天」；未完成的选择类改成「尚未…」 */
export function statusifyActivityTitle(title: string, done = false): string {
  const raw = String(title || '').trim()
  if (!raw) return '待推进'
  const base = stripDayMarkers(raw) || raw
  if (!done) {
    const m = base.match(/^(选择|选定|确定|挑定)(.+)$/)
    if (m) {
      const rest = m[2].replace(/^[ ：:]+/, '').trim()
      if (rest) return `尚未${m[1]}${rest}`
    }
  }
  return base
}

export function getSliceItems(
  slice: ActiveSlice | null | undefined,
  theme?: Theme | null,
): Array<{
  id: string
  label: string
  desc: string
  done?: boolean
  activityId?: string
  executionDoc?: import('./api').ExecutionDoc
  expanded?: boolean
}> {
  if (slice?.activities?.length) {
    return slice.activities.map((a) => {
      const executionDoc = a.execution_doc || EMPTY_EXECUTION
      const expanded = Boolean(
        (executionDoc.goal || '').trim() || (executionDoc.steps && executionDoc.steps.length > 0),
      )
      return {
        id: a.id,
        activityId: a.id,
        label: statusifyActivityTitle(a.title, Boolean(a.done)),
        desc: a.description || (a.activity_type ? `活动 · ${a.activity_type}` : slice.title || '计划活动'),
        done: a.done,
        executionDoc,
        expanded,
      }
    })
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

/** 从切片/主题文档读取每日时长，缺省 30 */
export function getDailyMinutes(
  slice?: ActiveSlice | null,
  theme?: Theme | null,
): number {
  const fromSlice = Number(slice?.daily_minutes)
  if (Number.isFinite(fromSlice) && fromSlice > 0) return fromSlice
  const docs = [theme?.ladder_doc, theme?.resources_doc]
  for (const doc of docs) {
    const n = Number((doc as { daily_minutes?: number } | undefined)?.daily_minutes)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_PLAN_PREFS.daily_minutes
}

export function workNoteKey(themeId: string) {
  return `work-note:${themeId}`
}

export function driftTitle(kind?: string) {
  if (kind === 'focus_over_one') return '主焦点偏多'
  if (kind === 'slot_full') return '阶段槽位已满'
  if (kind === 'phase_stuck') return '阶段可能卡住'
  return '漂移提示'
}

export type ThemeResource = {
  name: string
  type?: string
  how_to_use?: string
  covers?: string
  why?: string
  weread_readable?: boolean
  book_hint?: string
  weread?: {
    bookId?: string | null
    title?: string | null
    author?: string | null
    deepLink?: string | null
  } | null
}

export function listThemeResources(theme: Theme | null | undefined): ThemeResource[] {
  const raw = theme?.resources_doc?.resources
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r) => {
      const weread =
        r.weread && typeof r.weread === 'object'
          ? (r.weread as ThemeResource['weread'])
          : null
      return {
        name: String(r.name || ''),
        type: r.type != null ? String(r.type) : undefined,
        how_to_use: r.how_to_use != null ? String(r.how_to_use) : undefined,
        covers: r.covers != null ? String(r.covers) : undefined,
        why: r.why != null ? String(r.why) : undefined,
        weread_readable: Boolean(r.weread_readable),
        book_hint: r.book_hint != null ? String(r.book_hint) : undefined,
        weread,
      }
    })
    .filter((r) => r.name)
}

export function matchThemeResource(
  theme: Theme | null | undefined,
  ref?: { index?: number | null; name?: string } | null,
): ThemeResource | null {
  const list = listThemeResources(theme)
  if (!list.length || !ref) return null
  if (typeof ref.index === 'number' && ref.index >= 0 && ref.index < list.length) {
    return list[ref.index]
  }
  const name = (ref.name || '').trim()
  if (!name) return null
  const exact = list.find((r) => r.name === name)
  if (exact) return exact
  const loose = list.find(
    (r) => r.name.includes(name) || name.includes(r.name.replace(/[《》]/g, '')),
  )
  return loose || null
}

export function resourceDeepLink(resource: ThemeResource | null | undefined): string | null {
  const link = resource?.weread?.deepLink
  return typeof link === 'string' && link.trim() ? link.trim() : null
}

export function resourcesPathHint(theme: Theme | null | undefined): string {
  const path7d = String(theme?.resources_doc?.path_7d || '').trim()
  if (!path7d) return ''
  const first = path7d.split(/[。；;\n]/)[0]?.trim()
  return first || path7d.slice(0, 80)
}
