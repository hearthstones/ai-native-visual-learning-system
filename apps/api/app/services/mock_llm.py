"""UX trial mock LLM — activated when DEEPSEEK_API_KEY is literally `mock`.

Returns structured JSON matching cocreate / expand / weekly_review contracts
so persona walkthroughs can complete without a live provider.
"""

from __future__ import annotations

import re
from typing import Any


def is_mock_mode(api_key: str) -> bool:
    return (api_key or "").strip().lower() == "mock"


def _theme_hint(messages: list[dict[str, str]]) -> str:
    blob = " ".join(m.get("content") or "" for m in messages)
    m = re.search(r"主题[＝=:：]\s*([^\n；;，,]+)", blob)
    if m:
        return m.group(1).strip()
    m = re.search(r"标题[＝=:：]\s*([^\n；;，,]+)", blob)
    if m:
        return m.group(1).strip()
    # seed style: first line often has the title
    for line in blob.splitlines():
        line = line.strip()
        if line and len(line) < 40 and "请" not in line[:2]:
            return line[:24]
    return "当前主题"


def mock_chat_json(
    *,
    kind: str | None,
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    title = _theme_hint(messages)
    kind = kind or ""

    if kind == "stage":
        return {
            "assistant_message": f"已为「{title}」草拟 5 级阶梯。请点选你现在所在的级别，再确认。",
            "live_doc": {
                "levels": [
                    {
                        "level": 1,
                        "name": "入门感知",
                        "signal": "能说出主题要解决什么问题",
                        "exit": "用自己的话讲清目标与边界",
                    },
                    {
                        "level": 2,
                        "name": "核心框架",
                        "signal": "能画出主概念关系",
                        "exit": "默写一张概念图且无明显错误",
                    },
                    {
                        "level": 3,
                        "name": "带反馈练习",
                        "signal": "能在受限任务里做出可检查产出",
                        "exit": "完成 3 次带对照的小练习",
                    },
                    {
                        "level": 4,
                        "name": "迁移应用",
                        "signal": "能把方法用到新情境",
                        "exit": "独立完成一个贴近真实场景的小项目",
                    },
                    {
                        "level": 5,
                        "name": "教授与改进",
                        "signal": "能教别人并发现问题",
                        "exit": "写出可复用的检查清单并复盘一次",
                    },
                ],
                "selected_level": 2,
            },
        }

    if kind == "resources":
        tech = any(k in title.lower() for k in ("rust", "flutter", "api", "代码", "编程", "技术"))
        if tech:
            resources = [
                {
                    "name": f"{title} 官方文档入门章",
                    "why": "权威但偏全；适合当索引，不适合当第一天主读物",
                    "how_to_use": "只读与本周目标直接相关的 2～3 节，做笔记卡",
                    "type": "docs",
                },
                {
                    "name": "社区精选教程（动手向）",
                    "why": "比官方更快落地，但质量参差",
                    "how_to_use": "跟着做一个最小可运行例子，对照官方术语表",
                    "type": "tutorial",
                },
                {
                    "name": "AI 学习包：概念对照卡",
                    "why": "把官方术语翻译成你能默写的对照表",
                    "how_to_use": "每天默写 5 组对照，错的留到练习期",
                    "type": "ai_pack",
                },
                {
                    "name": "AI 学习包：典型失败病例",
                    "why": "提前见过坑，练习期少绕弯",
                    "how_to_use": "对照病例自检，写出自己会踩的 3 个坑",
                    "type": "ai_pack",
                },
                {
                    "name": "最短可运行例子仓库",
                    "why": "把概念落到能跑的代码上",
                    "how_to_use": "克隆后改一处参数并跑通，截图留证",
                    "type": "other",
                },
            ]
        else:
            resources = [
                {
                    "name": "如何阅读一本书",
                    "why": "通识阅读的经典框架，适合建立检查清单",
                    "how_to_use": "只精读「分析阅读」相关章节，做一张提问卡",
                    "type": "book",
                    "weread": True,
                },
                {
                    "name": "刻意练习",
                    "why": "把「多练」改成「带反馈的短循环」",
                    "how_to_use": "抽取反馈环三段式，套到你的主题",
                    "type": "book",
                    "weread": True,
                },
                {
                    "name": "AI 学习包：本周阅读脚本",
                    "why": "直接给加工后的步骤，减少原始资料消化成本",
                    "how_to_use": "按脚本执行 30 分钟，结束写三句收获",
                    "type": "ai_pack",
                },
                {
                    "name": "主题相关综述或入门讲义",
                    "why": "快速建立地图，避免只啃一本偏科",
                    "how_to_use": "只读目录与结论节，画出自己的概念图",
                    "type": "doc",
                },
                {
                    "name": "对标实践案例（短文/讲座）",
                    "why": "看到别人怎么用，方便迁移",
                    "how_to_use": "摘 3 条可照做的动作，下周练一条",
                    "type": "other",
                },
            ]
        return {
            "assistant_message": f"已为「{title}」筛出 {len(resources)} 份高杠杆资料。可继续加约束（如只要微信读书 / 只要动手向）。",
            "live_doc": {
                "constraints": ["优先可执行而非百科", "默认约 5 份"],
                "target_count": len(resources),
                "rationale": "约 5 份：信号够、噪音可控，且保留主书/脚本与动手向搭配。",
                "resources": resources,
                "order": list(range(len(resources))),
                "path_7d": "D1 建检查清单 → D2–4 短练习 → D5 对照复盘 → D6–7 迁移一小步",
            },
        }

    if kind == "plan":
        learn_acts = [
            {"title": "写清目标与边界", "description": "用可验证句子写下学完能演示什么", "activity_type": "learn", "minutes": 120},
            {"title": "核心术语对照卡", "description": "整理 8～12 个必须能默写的词", "activity_type": "learn", "minutes": 120},
            {"title": "精读主资料一章", "description": "带着问题精读并标记疑点", "activity_type": "learn", "minutes": 120},
            {"title": "跟做最小例子", "description": "跑通并截图/笔记证明", "activity_type": "learn", "minutes": 120},
            {"title": "对照自检三问", "description": "用阶梯自检题过一遍卡点", "activity_type": "learn", "minutes": 120},
            {"title": "错例复盘", "description": "收集 3 个典型失败并写避坑条", "activity_type": "learn", "minutes": 120},
            {"title": "小范围迁移练习", "description": "把例子改到贴近你的场景", "activity_type": "learn", "minutes": 120},
            {"title": "产出一页摘要", "description": "用自己的话写出可教别人的一页", "activity_type": "learn", "minutes": 120},
            {"title": "模拟讲解", "description": "对着录音讲 10 分钟并回听修表述", "activity_type": "learn", "minutes": 120},
            {"title": "学习期验收", "description": "对照目标做一次可演示验收", "activity_type": "learn", "minutes": 120},
        ]
        return {
            "assistant_message": f"已生成「{title}」学/练/用三阶段计划初稿（学习期按 10 节 × 2 小时）。可改每天分钟数或某阶段时长后再锁定。",
            "live_doc": {
                "goal": f"在可检查的节奏下推进「{title}」，先能演示再谈精通",
                "core_20": [
                    "目标与边界",
                    "核心术语",
                    "最小可运行例子",
                    "带反馈练习",
                    "迁移检查清单",
                ],
                "phases": {
                    "learning": {
                        "title": "学习期",
                        "duration": "10 节 × 2 小时",
                        "summary": "二八法则聚焦核心 20%，按 10 节课推进",
                        "activities": learn_acts,
                    },
                    "practice": {
                        "title": "练习期",
                        "duration": "约 4 周",
                        "activities": [
                            {
                                "title": "每日短循环",
                                "description": "30 分钟：做→对照→改一处",
                                "activity_type": "practice",
                                "minutes": 30,
                            },
                            {
                                "title": "错题本",
                                "description": "记录反复出错的 3 类问题",
                                "activity_type": "practice",
                                "minutes": 30,
                            },
                        ],
                    },
                    "application": {
                        "title": "应用期",
                        "duration": "长尾",
                        "activities": [
                            {
                                "title": "真实小项目",
                                "description": "选一个贴近工作/生活的任务落地",
                                "activity_type": "apply",
                                "minutes": 30,
                            }
                        ],
                    },
                },
                "durations": {
                    "learning": "10 节 × 2 小时",
                    "practice": "约 4 周",
                    "application": "长尾",
                },
                "phase_minutes": {"learning": 120, "practice": 30, "application": 30},
                "rationale": "学习期用 20 小时课表吃透核心，练习/应用保持每天约 30 分钟的可执行节奏。",
                "daily_minutes": 30,
            },
        }

    if kind == "activity_expand":
        return {
            "assistant_message": "已展开为可在 30 分钟内勾选完成的步骤。",
            "goal": f"完成与「{title}」相关的下一步可检查产出",
            "steps": [
                {"id": "s1", "text": "打开资料/环境，定位今天只做的一小块", "done": False},
                {"id": "s2", "text": "按检查清单做完主动作并留下痕迹（笔记/截图）", "done": False},
                {"id": "s3", "text": "用一句话写下今天验证了什么、下一步卡点", "done": False},
            ],
            "resource_ref": {"index": 0, "name": "今日主资料"},
            "outcome": "有可复查的产出物 + 一句复盘",
            "minutes": 30,
        }

    if kind == "weekly_review":
        return {
            "summary": "本周有主题在推进，但执行密度仍偏薄；建议把「下一步」压成今日可勾选项，并控制同时焦点。",
            "wins": ["至少完成了冷启动锁定，主路径已建立", "资料与计划有了可对照的活文档"],
            "issues": ["今日承诺完成率偏低或尚未形成节奏", "若同时开多个学习主题，槽位与心智会打架"],
            "adjustments": [
                "明天只承诺 1 条可在 30 分钟内完成的任务",
                "主题看板里用展开步骤代替「再看一遍计划」",
                "周复盘只改一条节奏参数，避免重写整份计划",
            ],
        }

    # Generic fallback
    return {
        "assistant_message": "（mock）已根据上下文生成回复。",
        "live_doc": {},
        "summary": "mock",
    }
