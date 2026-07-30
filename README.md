# AI Native Visual Learning System

可视化刻意练习系统。原型见 `prototype/`，正式应用在 `apps/`。

## 技术栈

| 层 | 选型 | 原因 |
|----|------|------|
| 前端 | Vite + React + TypeScript | 网页优先，后续 Electron 打包成本低 |
| 后端 | FastAPI (Python) | LLM / Skill 编排快；你可读 Python |
| 存储 | SQLite | 单人自用足够；数据文件在 `data/` |
| LLM | DeepSeek `deepseek-v4-flash` | 三次共创 + 周复盘 |
| 微信读书 | `skills/weread-skills` Gateway | 资料共创约束与书目 enrichment |

> 你熟悉 Java。本阶段选 Python 后端是为了 AI 接入速度；领域规则（槽位、阶段）仍清晰，之后若要迁 Spring Boot 也可按同一 API 契约重写。

## 快速开始

### 1. 配置密钥

在仓库根目录创建 `.env`：

```bash
DEEPSEEK_API_KEY=sk-...
WEREAD_API_KEY=wrk-...
```

可选：

```bash
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 2. 启动 API

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd apps/web
npm install
npm run dev
```

打开 http://localhost:5173

## 主路径

```text
空首页 → 创建主题信息 → 阶梯共创(Skill1) → 资料共创(Skill2+微信读书)
→ 计划共创锁定(Skill3 改编) → L2 看板 → L1 今日任务 / L3 作业面
→ 阶段管理(1+3+5) → 周复盘
```

## 目录

```text
apps/web          前端
apps/api          FastAPI
skills/           十倍速 Skill1–3 + weread-skills（入库副本）
prototype/        高保真原型（验收参照）
docs/             需求与规格
data/             SQLite 数据目录
```
