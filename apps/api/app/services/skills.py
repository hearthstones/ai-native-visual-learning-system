from pathlib import Path

from app.config import SKILLS_DIR


def load_skill_prompt(skill_name: str) -> str:
    path = SKILLS_DIR / skill_name / "SKILL.md"
    if not path.exists():
        raise FileNotFoundError(f"Skill not found: {path}")
    return path.read_text(encoding="utf-8")


def skill_system_block(skill_name: str, extra: str = "") -> str:
    body = load_skill_prompt(skill_name)
    parts = [
        "你是可视化刻意练习系统中的学习教练。",
        "严格遵循下方 SKILL 的产出结构与字段；用简体中文回复用户可见文案。",
        "每次回复必须同时给出：",
        "1) 给用户看的简短对话回复（assistant_message）",
        "2) 更新后的右侧活文档 JSON（live_doc）",
        "只输出一个 JSON 对象，不要 markdown 代码围栏。",
        "",
        f"=== SKILL: {skill_name} ===",
        body,
    ]
    if extra:
        parts.extend(["", "=== 产品适配约束 ===", extra])
    return "\n".join(parts)


STAGE_EXTRA = """
产品适配：
- 产出 5 级学习阶梯（Level 1–5）。
- live_doc 结构：
  {
    "levels": [
      {
        "level": 1,
        "name": "...",
        "understand": "...",
        "mastery": "...",
        "concepts": ["..."],
        "milestone": "...",
        "exercise": "...",
        "mistakes": ["..."],
        "self_check": "..."
      }
    ],
    "selected_level": null
  }
- 用户确认「我在哪一级」前 selected_level 可为 null；确认后写整数 1–5。
"""

RESOURCES_EXTRA = """
产品适配：
- 默认产出约 5 个高杠杆资源；若用户（含启动参数或对话）明确要求 N 个，必须严格产出 N 个，不得擅自截断或补回 5。
- order 长度必须与 resources 长度一致（0..N-1 的推荐阅读顺序）。
- 给出与资料配套的短路径摘要（默认可按约 7 天写 path_7d；若用户改了节奏，摘要跟着改）。
- 若用户限定「微信读书」，优先推荐微信读书可读的书籍，并在每项加 weread_readable: true/false 与可选 book_hint。
- live_doc 结构：
  {
    "constraints": ["..."],
    "target_count": 5,
    "resources": [
      {
        "name": "...",
        "type": "book|course|video|doc|other",
        "why": "...",
        "covers": "...",
        "learner_type": "...",
        "difficulty": "beginner|intermediate|advanced",
        "how_to_use": "...",
        "warning": "...",
        "weread_readable": false,
        "book_hint": ""
      }
    ],
    "order": [0, 1, 2],
    "path_7d": "..."
  }
"""

PLAN_EXTRA = """
产品适配（重要：不要照搬原 SKILL 的「10节×2小时」唯一形态）：
- 每天投入以用户指定的 daily_minutes 为准（默认 30）。
- 三阶段时长以用户指定为准，写入各 phase 的 duration 字段，并按该时长规划 activities 数量与节奏。
  常见默认：学习期约 7 天、练习期约 4 周、应用期长尾——但用户另选时必须服从用户。
- 产出主题生命周期三阶段计划：learning / practice / application。
- 保留「约 20% 核心」精神。
- live_doc 结构：
  {
    "goal": "...",
    "core_20": ["..."],
    "daily_minutes": 30,
    "durations": {
      "learning": "约 7 天",
      "practice": "约 4 周",
      "application": "长尾"
    },
    "phases": {
      "learning": {
        "title": "学习期",
        "duration": "约 7 天",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"learn"}]
      },
      "practice": {
        "title": "练习期",
        "duration": "约 4 周",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"practice"}]
      },
      "application": {
        "title": "应用期",
        "duration": "长尾",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"apply"}]
      }
    }
  }
- 冷启动锁定时：仅将 learning 阶段设为当前可执行；practice/application 先作为骨架保留。
"""


def system_prompt_for(kind: str) -> str:
    if kind == "stage":
        return skill_system_block("ai-learning-step1-stage", STAGE_EXTRA)
    if kind == "resources":
        return skill_system_block("ai-learning-step2-resource", RESOURCES_EXTRA)
    if kind == "plan":
        return skill_system_block("ai-learning-step3-plan", PLAN_EXTRA)
    if kind == "weekly_review":
        return (
            "你是可视化刻意练习系统的复盘教练。"
            "根据用户本周主题进度与完成情况，输出简体中文 JSON："
            '{"summary":"...","wins":["..."],"issues":["..."],"adjustments":["..."]}'
            "不要 markdown 代码围栏。"
        )
    raise ValueError(f"Unknown cocreate kind: {kind}")
