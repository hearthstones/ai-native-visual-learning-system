# AI Native Visual Learning System

> **状态：系统暂停 · 已封板（2026-08-12）** · 发行版 `v0.9.0` / 标记 `freeze-2026-08-12`  
> 诚实记账与重启门槛见 [`docs/requirements/2026-08-12-能力边界与产品身份-诚实记账与暂停.md`](./docs/requirements/2026-08-12-能力边界与产品身份-诚实记账与暂停.md)。  
> 封板交接（坐标 / 资产索引 / 开放项）见 [`docs/requirements/2026-08-12-系统封板交接.md`](./docs/requirements/2026-08-12-系统封板交接.md)。  
> 暂停期间不排新功能；本地仍可按下方步骤自用。

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

在仓库根目录创建 `.env`（可参考 `.env.example`）：

```bash
DEEPSEEK_API_KEY=sk-...
WEREAD_API_KEY=wrk-...

# 系统门禁（设置密码后，打开网页需先登录）
AUTH_USERNAME=admin
AUTH_PASSWORD=你的密码
```

可选：

```bash
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
# AUTH_SECRET=可选会话签名密钥
```

> 未设置 `AUTH_PASSWORD` 时不启用门禁（便于本地调试）。改密后需重新登录。

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
docs/ai-engineering/  AI 工程化方法索引（评测 / 档位 / 流水线等）
data/             SQLite 数据目录
```

AI 工程化笔记入口：[`docs/ai-engineering/README.md`](./docs/ai-engineering/README.md)。
