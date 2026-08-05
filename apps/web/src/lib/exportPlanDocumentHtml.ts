import type { Theme } from './api'
import { DEFAULT_PLAN_PREFS } from './planPrefs'
import { getLadderLevels, getSelectedLevel, phaseZh } from './themeDoc'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayConstraints(raw: string[]): string[] {
  return raw.filter((c) => !/^(主题|类型|目标|当前阶梯)\s*[：:]/.test(c.trim()))
}

function typeZh(type: unknown): string {
  const t = String(type || '').trim()
  const map: Record<string, string> = {
    book: '书',
    article: '文章',
    video: '视频',
    course: '课程',
    tool: '工具',
    docs: '文档',
    doc: '文档',
  }
  return map[t.toLowerCase()] || t
}

function difficultyZh(value: unknown): string {
  const t = String(value || '').trim()
  const map: Record<string, string> = {
    beginner: '入门',
    easy: '简单',
    intermediate: '中级',
    medium: '中等',
    advanced: '进阶',
    hard: '较难',
  }
  return map[t.toLowerCase()] || t
}

function coreTitles(planDoc: Record<string, unknown>): string[] {
  const raw = Array.isArray(planDoc.core_20) ? planDoc.core_20 : []
  return raw
    .map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object' && 'title' in c) return String((c as { title: unknown }).title)
      return String(c ?? '')
    })
    .filter(Boolean)
}

function typeLabel(themeType: string): string {
  if (themeType === 'tech') return '技术'
  if (themeType === 'general') return '通识'
  return themeType
}

function formatMinutes(mins: number): string {
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} 小时`
  return `${mins} 分钟`
}

function renderLadder(theme: Theme): string {
  const levels = getLadderLevels(theme)
  const selected = getSelectedLevel(theme)
  if (!levels.length) return '<div class="docbook-empty">暂无学习阶梯</div>'

  return `<div class="ladder">${levels
    .map((lv) => {
      const active = selected === lv.level
      const concepts = (lv.concepts || []).join('、')
      const rows = [
        ['理解', lv.understand],
        ['掌握', lv.mastery],
        ['核心概念', concepts],
        ['里程碑', lv.milestone],
        ['练习', lv.exercise],
        ['自检', lv.self_check],
      ]
        .filter(([, v]) => String(v || '').trim())
        .map(
          ([k, v]) =>
            `<div class="row"><span class="k">${esc(k)}：</span>${esc(v)}</div>`,
        )
        .join('')

      return `<div class="ladder__row ladder__row--readonly${active ? ' is-selected' : ''}">
  <div class="ladder__lvl">L${esc(lv.level)}</div>
  <div>
    <div class="ladder__name">${esc(lv.name)}${
      active ? '<span class="ds-tag ds-tag--brand ladder__badge">当前定位</span>' : ''
    }</div>
    <div class="ladder__desc">${rows}</div>
  </div>
</div>`
    })
    .join('\n')}</div>`
}

function renderResources(doc: Record<string, unknown>): string {
  const resources = (doc.resources as Array<Record<string, unknown>>) || []
  const constraints = displayConstraints((doc.constraints as string[]) || [])
  const rationale = String(doc.rationale || '').trim()
  const path7d = String(doc.path_7d || '').trim()
  if (!resources.length && !constraints.length && !rationale) {
    return '<div class="docbook-empty">暂无学习资料</div>'
  }

  const tags = constraints.length
    ? `<div class="constraint-tags">${constraints
        .map((c) => `<span class="constraint-tag">${esc(c)}</span>`)
        .join('')}</div>`
    : ''

  const list = resources
    .map((r, i) => {
      const core = i < 2
      const type = typeZh(r.type)
      const fields = [
        r.learner_type
          ? `<div class="resource-field"><div class="resource-field__label">适合</div><div class="resource-field__value">${esc(r.learner_type)}</div></div>`
          : '',
        r.difficulty
          ? `<div class="resource-field"><div class="resource-field__label">难度</div><div class="resource-field__value">${esc(difficultyZh(r.difficulty))}</div></div>`
          : '',
        r.covers
          ? `<div class="resource-field resource-field--full"><div class="resource-field__label">覆盖</div><div class="resource-field__value">${esc(r.covers)}</div></div>`
          : '',
        r.why
          ? `<div class="resource-field resource-field--full"><div class="resource-field__label">为什么选它</div><div class="resource-field__value">${esc(r.why)}</div></div>`
          : '',
        r.how_to_use
          ? `<div class="resource-field resource-field--full"><div class="resource-field__label">最短路径</div><div class="resource-field__value">${esc(r.how_to_use)}</div></div>`
          : '',
        r.warning
          ? `<div class="resource-field resource-field--full"><div class="resource-field__label">注意</div><div class="resource-field__warning">⚠ ${esc(r.warning)}</div></div>`
          : '',
      ]
        .filter(Boolean)
        .join('')

      return `<div class="resource-card">
  <div class="resource-card__head">
    <span class="resource-card__icon">◈</span>
    <div>
      <div class="resource-card__title">${esc(r.name || `资源 ${i + 1}`)}</div>
      <div class="resource-card__author">${esc(type)}</div>
    </div>
    <div class="resource-card__tags">
      <span class="ds-tag${core ? ' ds-tag--brand' : ''}">${core ? '核心' : '补充'}</span>
      ${r.difficulty ? `<span class="ds-tag">${esc(difficultyZh(r.difficulty))}</span>` : ''}
    </div>
  </div>
  <div class="resource-card__body">${fields}</div>
</div>`
    })
    .join('\n')

  return `${tags}
${rationale ? `<p class="text-secondary export-lede">${esc(rationale)}</p>` : ''}
${path7d ? `<p class="text-secondary export-lede"><span class="export-kicker">7 日路径</span>${esc(path7d)}</p>` : ''}
${resources.length ? `<div class="doc-section__head doc-section__head--subtle"><span class="doc-section__title">学习资源（${resources.length} 份）</span></div>` : ''}
<div class="resources">${list}</div>`
}

function renderPlan(planDoc: Record<string, unknown>): string {
  const cores = coreTitles(planDoc)
  const phases =
    (planDoc.phases as Record<
      string,
      {
        title?: string
        duration?: string
        summary?: string
        activities?: Array<{ title?: string; description?: string; minutes?: number }>
      }
    >) || {}
  const durations = (planDoc.durations as Record<string, string>) || {}
  const phaseMinutes = (planDoc.phase_minutes as Record<string, number>) || {}
  const goal = String(planDoc.goal || '').trim()
  const rationale = String(planDoc.rationale || '').trim()
  const daily = planDoc.daily_minutes
    ? Number(planDoc.daily_minutes)
    : DEFAULT_PLAN_PREFS.daily_minutes

  const phaseMeta = [
    {
      key: 'learning',
      badgeClass: 'phase-block__badge--learn',
      fallback: DEFAULT_PLAN_PREFS.learning_duration,
      defaultMin: 120,
      short: '学',
    },
    {
      key: 'practice',
      badgeClass: 'phase-block__badge--practice',
      fallback: DEFAULT_PLAN_PREFS.practice_duration,
      defaultMin: 30,
      short: '练',
    },
    {
      key: 'application',
      badgeClass: 'phase-block__badge--apply',
      fallback: DEFAULT_PLAN_PREFS.application_duration,
      defaultMin: 30,
      short: '用',
    },
  ]

  const coreHtml = cores.length
    ? `<div class="core20">${cores
        .map((c) => `<div class="core20__item"><span class="dot"></span>${esc(c)}</div>`)
        .join('')}</div>`
    : '<div class="docbook-empty">暂无核心精神</div>'

  const phaseHtml = phaseMeta
    .map(({ key, badgeClass, fallback, defaultMin, short }) => {
      const phase = phases[key]
      if (!phase) return ''
      const duration = phase.duration || durations[key] || fallback
      const phaseMin = Number(phaseMinutes[key]) || defaultMin
      const acts = phase.activities || []
      const sessions = acts
        .map((a, i) => {
          const mins = Number(a.minutes) || phaseMin
          return `<div class="session-card">
  <div class="session-card__top">
    <span class="session-card__num">${i + 1}</span>
    <span class="session-card__title">${esc(a.title || '活动')}</span>
    <span class="session-card__duration">${esc(formatMinutes(mins))}</span>
  </div>
  ${
    a.description
      ? `<div class="session-card__grid"><div class="session-field session-field--full"><div class="session-field__label">说明</div><div class="session-field__value">${esc(a.description)}</div></div></div>`
      : ''
  }
</div>`
        })
        .join('\n')

      return `<section class="doc-section doc-section--embedded">
  <div class="doc-section__head doc-section__head--subtle">
    <span class="doc-section__title">${esc(phase.title || key)}</span>
    <span class="phase-block__badge ${badgeClass}">${esc(short)} · ${esc(duration)}</span>
  </div>
  ${phase.summary ? `<p class="text-secondary export-lede">${esc(phase.summary)}</p>` : ''}
  <div class="sessions">${sessions || '<div class="docbook-empty">暂无活动</div>'}</div>
</section>`
    })
    .join('\n')

  return `${goal ? `<p class="text-secondary export-lede">目标 · ${esc(goal)}</p>` : ''}
${rationale ? `<p class="text-secondary export-lede">${esc(rationale)}</p>` : ''}
<p class="text-tertiary export-meta">练 / 用期建议每天约 ${esc(daily)} 分钟</p>
<section class="doc-section doc-section--embedded">
  <div class="doc-section__head doc-section__head--subtle">
    <span class="doc-section__title">核心精神</span>
  </div>
  ${coreHtml}
</section>
${phaseHtml || '<div class="docbook-empty">暂无学习计划</div>'}`
}

/** 与站内 Trae 深色主题一致的导出样式（tokens + 共创组件 + 计划书壳） */
const STYLES = `
:root {
  --radius-2: 2px; --radius-4: 4px; --radius-6: 6px; --radius-8: 8px;
  --spacer-4: 4px; --spacer-6: 6px; --spacer-8: 8px; --spacer-10: 10px;
  --spacer-12: 12px; --spacer-16: 16px; --spacer-24: 24px; --spacer-32: 32px; --spacer-40: 40px;
  --font-weight-medium: 500; --font-weight-strong: 600;
  --body-xs-font-size: 10px; --body-sm-font-size: 11px; --body-base-font-size: 13px;
  --heading-xs-font-size: 13px; --heading-xs-font-weight: 600;
  --heading-sm-font-size: 16px; --heading-lg-font-size: 22px; --heading-lg-font-weight: 600;
  --heading-lg-line-height: 30px;
  --code-editor-font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
  --bg-base-default: #1A1B1D;
  --bg-base-secondary: #222427;
  --bg-overlay-l1: rgba(224, 226, 242, 0.04);
  --bg-overlay-l2: rgba(224, 226, 242, 0.06);
  --bg-overlay-l3: rgba(224, 226, 242, 0.08);
  --bg-brand: #32F08C;
  --bg-brand-popup: rgba(50, 240, 140, 0.12);
  --text-default: #D1D3DB;
  --text-secondary: #9599A6;
  --text-tertiary: #8B909C;
  --text-brand: #32F08C;
  --text-onbrand: #0C0C0D;
  --border-neutral-l1: rgba(224, 226, 242, 0.1);
  --border-neutral-l2: rgba(224, 226, 242, 0.16);
  --border-neutral-l3: rgba(224, 226, 242, 0.2);
  --border-brand: #32F08C;
  --border-default: var(--border-neutral-l1);
  --accent-amber: #DCB364;
  --status-alert-default: #DCB364;
  --status-alert-surface-l1: rgba(220, 179, 100, 0.16);
  --status-primary-default: #387BFF;
  --status-primary-surface-l1: rgba(56, 123, 255, 0.16);
  --status-warning-default: #DCB364;
}
* { box-sizing: border-box; }
html { color-scheme: dark; scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg-base-default);
  color: var(--text-default);
  font-family: "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
  font-size: var(--body-base-font-size);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
.docbook-page {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacer-32) var(--spacer-32) var(--spacer-40);
  display: flex;
  flex-direction: column;
  gap: var(--spacer-24);
}
.docbook-header { display: flex; flex-direction: column; gap: var(--spacer-8); }
.docbook-header__eyebrow {
  font-size: var(--body-sm-font-size);
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}
.docbook-header__title {
  margin: 0;
  font-size: var(--heading-lg-font-size);
  font-weight: var(--heading-lg-font-weight);
  line-height: var(--heading-lg-line-height);
  color: var(--text-default);
}
.docbook-header__meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacer-8);
  color: var(--text-secondary); font-size: var(--body-sm-font-size);
}
.docbook-toc {
  display: flex; flex-wrap: wrap; gap: var(--spacer-8) var(--spacer-16);
  padding: var(--spacer-12) 0;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
}
.docbook-toc a { color: var(--text-secondary); font-size: var(--body-sm-font-size); }
.docbook-toc a:hover { color: var(--text-brand); }
.docbook-chapter {
  display: flex; flex-direction: column; gap: var(--spacer-16);
  scroll-margin-top: var(--spacer-24);
}
.docbook-chapter__head { display: flex; align-items: baseline; gap: var(--spacer-8); }
.docbook-chapter__index {
  font-family: var(--code-editor-font-family);
  font-size: var(--body-sm-font-size);
  color: var(--text-tertiary);
}
.docbook-chapter__title {
  margin: 0;
  font-size: var(--heading-sm-font-size);
  font-weight: 600;
  color: var(--text-default);
}
.docbook-empty {
  padding: var(--spacer-16);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-8);
  color: var(--text-tertiary);
  font-size: var(--body-sm-font-size);
}
.docbook-foot {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacer-8);
  padding-top: var(--spacer-16);
  border-top: 1px solid var(--border-default);
  color: var(--text-tertiary);
  font-size: var(--body-sm-font-size);
}
.doc-section { display: flex; flex-direction: column; gap: var(--spacer-12); }
.doc-section--embedded + .doc-section--embedded { margin-top: var(--spacer-16); }
.doc-section__head { display: flex; align-items: center; gap: var(--spacer-8); }
.doc-section__head--subtle { margin-bottom: var(--spacer-8); }
.doc-section__title {
  font-size: var(--heading-xs-font-size);
  font-weight: var(--heading-xs-font-weight);
  color: var(--text-default);
}
.ds-tag {
  display: inline-flex; align-items: center;
  padding: 0 var(--spacer-6); height: 18px;
  border-radius: var(--radius-2);
  font-size: var(--body-xs-font-size); line-height: 1;
  background: var(--bg-overlay-l2); color: var(--text-secondary);
  border: 1px solid var(--border-neutral-l1);
}
.ds-tag--brand { background: var(--bg-brand-popup); color: var(--text-brand); border-color: transparent; }
.ladder { display: flex; flex-direction: column; gap: var(--spacer-8); }
.ladder__row {
  display: grid; grid-template-columns: 44px 1fr; gap: var(--spacer-12); align-items: start;
  padding: var(--spacer-12);
  background: var(--bg-overlay-l1);
  border: 1px solid var(--border-neutral-l1);
  border-radius: var(--radius-6);
}
.ladder__row.is-selected { background: var(--bg-brand-popup); border-color: var(--border-brand); }
.ladder__lvl {
  font-family: var(--code-editor-font-family);
  font-size: var(--body-xs-font-size);
  color: var(--text-tertiary); padding-top: 2px;
}
.ladder__row.is-selected .ladder__lvl { color: var(--text-brand); }
.ladder__name {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacer-8);
  font-size: var(--body-sm-font-size); font-weight: var(--font-weight-medium);
  color: var(--text-default); margin-bottom: var(--spacer-4);
}
.ladder__row.is-selected .ladder__name { color: var(--text-brand); }
.ladder__badge { font-size: 10px; }
.ladder__desc { font-size: var(--body-xs-font-size); line-height: 1.5; color: var(--text-secondary); }
.ladder__desc .row {
  display: grid; grid-template-columns: 4.5em minmax(0, 1fr);
  gap: 4px 10px; margin-bottom: 6px; align-items: start;
}
.ladder__desc .k { color: var(--text-tertiary); white-space: nowrap; }
.constraint-tags { display: flex; flex-wrap: wrap; gap: var(--spacer-6); margin-bottom: var(--spacer-8); }
.constraint-tag {
  display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
  border-radius: 999px; font-size: var(--body-xs-font-size);
  background: var(--bg-overlay-l2); color: var(--text-secondary);
  border: 1px solid var(--border-neutral-l1);
}
.resources { display: flex; flex-direction: column; gap: var(--spacer-8); }
.resource-card {
  background: var(--bg-overlay-l1);
  border: 1px solid var(--border-neutral-l2);
  border-radius: var(--radius-6);
  padding: var(--spacer-12) var(--spacer-16);
}
.resource-card__head {
  display: flex; align-items: center; gap: var(--spacer-8);
  margin-bottom: var(--spacer-10);
}
.resource-card__icon {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-overlay-l3); border-radius: var(--radius-6);
  color: var(--accent-amber); font-size: 12px;
}
.resource-card__title {
  font-size: var(--body-sm-font-size); font-weight: var(--font-weight-medium); color: var(--text-default);
}
.resource-card__author { font-size: var(--body-xs-font-size); color: var(--text-tertiary); }
.resource-card__tags { margin-left: auto; display: inline-flex; gap: var(--spacer-6); flex-wrap: wrap; }
.resource-card__body {
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacer-6) var(--spacer-16);
}
.resource-field { display: flex; flex-direction: column; gap: 2px; }
.resource-field--full { grid-column: 1 / -1; }
.resource-field__label {
  font-size: var(--body-xs-font-size); color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.resource-field__value {
  font-size: var(--body-sm-font-size); line-height: 1.5; color: var(--text-default);
}
.resource-field__warning {
  font-size: var(--body-xs-font-size); color: var(--status-warning-default); line-height: 1.5;
}
.core20 { display: flex; flex-direction: column; gap: var(--spacer-6); }
.core20__item {
  display: flex; align-items: flex-start; gap: var(--spacer-8);
  padding: var(--spacer-10) var(--spacer-12);
  background: var(--bg-overlay-l1); border: 1px solid var(--border-neutral-l1);
  border-radius: var(--radius-6);
  font-size: var(--body-sm-font-size); color: var(--text-default);
}
.core20__item .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--bg-brand); margin-top: 7px; flex-shrink: 0;
}
.phase-block__badge {
  display: inline-flex; align-items: center; height: 18px; padding: 0 6px;
  border-radius: var(--radius-2); font-size: var(--body-xs-font-size); margin-left: auto;
}
.phase-block__badge--learn { background: var(--bg-brand-popup); color: var(--text-brand); }
.phase-block__badge--practice { background: var(--status-alert-surface-l1); color: var(--status-alert-default); }
.phase-block__badge--apply { background: var(--status-primary-surface-l1); color: var(--status-primary-default); }
.sessions { display: flex; flex-direction: column; gap: var(--spacer-8); }
.session-card {
  background: var(--bg-overlay-l1);
  border: 1px solid var(--border-neutral-l2);
  border-radius: var(--radius-6);
  padding: var(--spacer-12) var(--spacer-16);
}
.session-card__top {
  display: flex; align-items: center; gap: var(--spacer-8); margin-bottom: var(--spacer-8);
}
.session-card__num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--radius-4);
  background: var(--bg-overlay-l3); color: var(--text-default);
  font-family: var(--code-editor-font-family); font-size: var(--body-xs-font-size);
  font-weight: var(--font-weight-medium); flex-shrink: 0;
}
.session-card__title {
  font-size: var(--body-sm-font-size); font-weight: var(--font-weight-medium); color: var(--text-default);
}
.session-card__duration {
  margin-left: auto; font-size: var(--body-xs-font-size); color: var(--text-tertiary);
}
.session-card__grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacer-6) var(--spacer-16);
}
.session-field { display: flex; flex-direction: column; gap: 2px; }
.session-field--full { grid-column: 1 / -1; }
.session-field__label {
  font-size: var(--body-xs-font-size); color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.session-field__value {
  font-size: var(--body-sm-font-size); line-height: 1.5; color: var(--text-default);
}
.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.export-lede { margin: 0 0 8px; font-size: 12px; line-height: 1.6; }
.export-meta { margin: 0 0 14px; font-size: 11px; }
.export-kicker {
  display: block; margin-bottom: 4px; color: var(--text-brand);
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
}
@media (max-width: 640px) {
  .docbook-page { padding: var(--spacer-24) var(--spacer-16) var(--spacer-32); }
  .resource-card__body { grid-template-columns: 1fr; }
  .ladder__desc .row { grid-template-columns: 1fr; }
}
@media print {
  body { background: #fff; color: #111; }
  .ladder__row, .resource-card, .session-card, .core20__item {
    break-inside: avoid; background: #f7f7f8; border-color: #ddd;
  }
}
`

/** 生成可离线打开的单文件 HTML（主题计划书 · 站内同款深色风格） */
export function buildPlanDocumentHtml(
  theme: Theme,
  planDoc: Record<string, unknown>,
): string {
  const generatedAt = new Date().toLocaleString('zh-CN')
  const phase = phaseZh[theme.phase] || theme.phase
  const level = getSelectedLevel(theme)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${esc(theme.title)} · 主题计划书</title>
<style>${STYLES}</style>
</head>
<body>
<main class="docbook-page">
  <header class="docbook-header">
    <div class="docbook-header__eyebrow">主题计划书</div>
    <h1 class="docbook-header__title">${esc(theme.title)}</h1>
    <div class="docbook-header__meta">
      <span class="ds-tag ds-tag--brand">${esc(typeLabel(theme.theme_type))}</span>
      <span class="ds-tag">${esc(phase)}</span>
      ${level != null ? `<span class="ds-tag">阶梯 L${esc(level)}</span>` : ''}
      ${theme.goal ? `<span>${esc(theme.goal)}</span>` : ''}
    </div>
  </header>

  <nav class="docbook-toc" aria-label="计划书目录">
    <a href="#chapter-ladder">一、学习阶梯</a>
    <a href="#chapter-resources">二、学习资料</a>
    <a href="#chapter-plan">三、学习计划</a>
  </nav>

  <section class="docbook-chapter" id="chapter-ladder">
    <div class="docbook-chapter__head">
      <span class="docbook-chapter__index">01</span>
      <h2 class="docbook-chapter__title">学习阶梯</h2>
    </div>
    ${renderLadder(theme)}
  </section>

  <section class="docbook-chapter" id="chapter-resources">
    <div class="docbook-chapter__head">
      <span class="docbook-chapter__index">02</span>
      <h2 class="docbook-chapter__title">学习资料</h2>
    </div>
    ${renderResources(theme.resources_doc || {})}
  </section>

  <section class="docbook-chapter" id="chapter-plan">
    <div class="docbook-chapter__head">
      <span class="docbook-chapter__index">03</span>
      <h2 class="docbook-chapter__title">学习计划</h2>
    </div>
    ${renderPlan(planDoc)}
  </section>

  <footer class="docbook-foot">
    <span>导出时间 ${esc(generatedAt)}</span>
    <span>·</span>
    <span>不含今日任务与复盘</span>
  </footer>
</main>
</body>
</html>`
}

export function downloadPlanDocumentHtml(
  theme: Theme,
  planDoc: Record<string, unknown>,
  filename?: string,
): void {
  const html = buildPlanDocumentHtml(theme, planDoc)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (theme.title || '主题计划书').replace(/[\\/:*?"<>|]+/g, '-').trim() || '主题计划书'
  a.href = url
  a.download = filename || `${safe}-计划书.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延后 revoke：部分 WebKit 在 click 同步 revoke 时下载尚未开始
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
