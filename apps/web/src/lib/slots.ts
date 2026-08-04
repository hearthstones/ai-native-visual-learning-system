import type { ThemePhase } from './api'

/** 与后端 `PHASE_SLOT_LIMITS` / `MAX_FOCUS` 保持一致 */
export const SLOT_DEFAULTS: Record<ThemePhase, number> = {
  learning: 1,
  practice: 3,
  application: 5,
}

export const MAX_FOCUS = 3

export type SlotSnap = { used: number; max: number }
export type SlotMap = Partial<Record<ThemePhase, SlotSnap>> &
  Record<string, SlotSnap | undefined>

export function slotUsed(slots: SlotMap | null | undefined, phase: ThemePhase): number {
  return slots?.[phase]?.used ?? 0
}

export function slotMax(slots: SlotMap | null | undefined, phase: ThemePhase): number {
  return slots?.[phase]?.max ?? SLOT_DEFAULTS[phase]
}

export function isSlotFull(slots: SlotMap | null | undefined, phase: ThemePhase): boolean {
  return slotUsed(slots, phase) >= slotMax(slots, phase)
}

export function isLearningSlotFull(slots: SlotMap | null | undefined): boolean {
  return isSlotFull(slots, 'learning')
}

export function formatSlotPair(slots: SlotMap | null | undefined, phase: ThemePhase): string {
  return `${slotUsed(slots, phase)}/${slotMax(slots, phase)}`
}

/** 「学 a/b · 练 c/d · 用 e/f」三段文案 */
export function slotSummaryParts(slots: SlotMap | null | undefined) {
  return {
    learning: formatSlotPair(slots, 'learning'),
    practice: formatSlotPair(slots, 'practice'),
    application: formatSlotPair(slots, 'application'),
  }
}
