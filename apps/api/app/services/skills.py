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
产品适配（两步共创）：
1) 首轮：根据主题、目标、当前阶梯，直接推荐可执行资料方案，不要先追问用户要几份。
   - 默认 3 份（信号够、噪音少）；除非用户明确要求更多，否则不要堆到 5+。
   - 主题类型=general（通识）：默认交付「1 本主书 + 本周阅读脚本（AI 加工稿）」形态；
     how_to_use 必须含可立即执行的步骤/输出物，禁止只丢三本经典并列书单。
     优先微信读书可读书籍；type 可用 book / script / ai_pack。
   - 主题类型=tech（技术）：默认交付「AI 学习包」——概念对照卡、常见错误/病例、最短可运行例子；
     官方文档/The Book 全本配额 ≤1，且角色只能是「索引」写进 how_to_use，禁止当第一天主读物。
   - assistant_message 用 1–2 句说明为何这样配，并邀请用户提意见。
2) 其后：用户意见优先。例如「想要更多参考」「精简聚焦」「只要微信读书」「再硬核」——严格按最新意见更新 resources / order / target_count / path_7d；指定 N 份就必须恰好 N 份。
- order 长度必须与 resources 一致。
- 若用户限定「微信读书」，优先可读书籍，并加 weread_readable 与可选 book_hint。
- 书名必须用可检索的正式书名（与封面/微信读书标题一致），禁止用口耳相传的俗称占位；
  找不到同名书时：不要硬挂「看起来相关」的另一本书，warning 写「待核验」，或改推你有把握的正式书名。
- type=script / ai_pack 是站内加工稿（阅读脚本、对照卡、病例、示例），不是书；
  禁止给它们填 weread_readable=true，禁止把学习包/脚本伪装成可打开的书籍链接。
- 不确定是否真实存在的书名，必须在 warning 写「待核验」，禁止装作权威出处。
- live_doc 结构：
  {
    "constraints": ["..."],
    "target_count": 3,
    "rationale": "一句话：为何这份清单适合当前阶梯与目标",
    "resources": [
      {
        "name": "...",
        "type": "book|course|video|doc|script|ai_pack|other",
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
产品适配（两步共创）：
1) 首轮：根据主题、目标、阶梯级别、资料清单推荐计划；节奏锚点如下（除非用户另有要求，否则首轮按此）：
   - 学习期：约 4–6 条可检查活动（不要默认 10 条）；duration 可用「约 1–2 周」或等价短节奏；activity_type=learn
   - 练习期：约 4 周骨架，activities 最多 4 条（按周密度，不要堆 8 条细项）；每天约 30 分钟；activity_type=practice
   - 应用期：长尾骨架，activities 最多 3 条；每天约 30 分钟；activity_type=apply
   - assistant_message 说明推荐理由，并邀请用户提意见。
2) 其后：用户意见优先（更早练习、缩短学期、每天更少时间等）——必须同步改 daily_minutes、durations、phase_minutes、各 phase.duration，并按新节奏裁剪/重排 activities（数量也要匹配）。
- 产出三阶段 learning / practice / application；保留约 20% 核心（core_20 5 条左右即可）。
- activity title 尽量 ≤20 字，可执行；细节放 description。
- live_doc 结构：
  {
    "goal": "...",
    "core_20": ["..."],
    "rationale": "一句话：为何这套节奏适合当前上下文",
    "durations": {
      "learning": "约 1–2 周",
      "practice": "约 4 周",
      "application": "长尾"
    },
    "phase_minutes": {
      "learning": 30,
      "practice": 30,
      "application": 30
    },
    "daily_minutes": 30,
    "phases": {
      "learning": {
        "title": "学习期",
        "duration": "约 1–2 周",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"learn","minutes":30}]
      },
      "practice": {
        "title": "练习期",
        "duration": "约 4 周",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"practice","minutes":30}]
      },
      "application": {
        "title": "应用期",
        "duration": "长尾",
        "summary": "...",
        "activities": [{"title":"...","description":"...","activity_type":"apply","minutes":30}]
      }
    }
  }
- 冷启动锁定时：仅 learning 可执行；practice/application 先作骨架。
- activity title/description 用可执行动作或状态（如「选定实践项目」「精读原文并标记疑点」）；
  禁止写「第 N 天 / 第 N-M 天」等日历序号，避免未完成时像逾期。
"""


def system_prompt_for(kind: str) -> str:
    if kind == "stage":
        return skill_system_block("ai-learning-step1-stage", STAGE_EXTRA)
    if kind == "resources":
        return skill_system_block("ai-learning-step2-resource", RESOURCES_EXTRA)
    if kind == "plan":
        return skill_system_block("ai-learning-step3-plan", PLAN_EXTRA)
    if kind == "activity_expand":
        return skill_system_block("ai-learning-activity-expand")
    if kind == "weekly_review":
        return (
            "你是可视化刻意练习系统的复盘教练。"
            "根据用户本周主题进度与完成情况，输出简体中文 JSON："
            '{"summary":"...","wins":["..."],"issues":["..."],"adjustments":["..."]}'
            "硬约束："
            "1) 必须严格依据 payload.stats 与 tasks 的事实，禁止编造未发生的执行成果；"
            "2) 若 stats.completion_rate=0 或 tasks 全未完成，summary 不得写「已能运用/已掌握/有成效」；"
            "wins 只能写真实启动类事项，或返回空数组 []；issues 须点名执行率低；"
            "3) 若 mastery 全为 0 或未练习，不得声称概念已内化；"
            "4) adjustments 要可执行、可检查，避免空洞态度句。"
            "不要 markdown 代码围栏。"
        )
    raise ValueError(f"Unknown cocreate kind: {kind}")
