from __future__ import annotations

from app.models import Activity, Theme
from app.services import activity_expand as expand_svc


def test_normalize_execution_basic():
    raw = {
        "assistant_message": "ok",
        "execution": {
            "goal": "读完第一章并划线",
            "steps": [{"text": "打开第一章"}, {"text": "划出 3 处不懂"}, "写一句摘要"],
            "resource_ref": {"index": 0, "name": "实践论"},
            "outcome": "留下一句章节摘要",
            "minutes": 30,
        },
    }
    doc = expand_svc.normalize_execution(raw, daily_minutes=30)
    assert doc["goal"].startswith("读完")
    assert len(doc["steps"]) == 3
    assert all("id" in s and s["done"] is False for s in doc["steps"])
    assert doc["resource_ref"]["name"] == "实践论"
    assert doc["outcome"]
    assert doc["minutes"] == 30
    assert expand_svc.has_execution(doc)


def test_execution_summary_and_next_step():
    doc = {
        "goal": "读完第一章",
        "steps": [
            {"id": "1", "text": "打开书", "done": True},
            {"id": "2", "text": "划线三处", "done": False},
        ],
        "minutes": 30,
    }
    summary = expand_svc.execution_summary(doc)
    assert summary is not None
    assert summary["expanded"] is True
    assert summary["goal"] == "读完第一章"
    assert summary["next_step"] == "划线三处"
    assert summary["steps_done"] == 1
    assert summary["steps_total"] == 2
    assert summary["minutes"] == 30
    assert expand_svc.next_undone_step_text(doc) == "划线三处"
    assert expand_svc.execution_summary({}) is None
    assert expand_svc.execution_summary(None) is None


def test_manual_patch_preserves_step_done():
    current = expand_svc.normalize_execution(
        {
            "execution": {
                "goal": "g",
                "steps": [{"text": "A"}, {"text": "B"}],
                "outcome": "o",
                "minutes": 30,
            }
        },
        daily_minutes=30,
    )
    current["steps"][0]["done"] = True
    patched = expand_svc.apply_manual_patch(
        current,
        {"goal": "g2", "steps": [{"text": "A"}, {"text": "B"}, {"text": "C"}]},
        daily_minutes=30,
    )
    assert patched["goal"] == "g2"
    assert patched["steps"][0]["done"] is True
    assert patched["steps"][2]["text"] == "C"
    assert patched["steps"][2]["done"] is False


def test_set_step_done():
    doc = expand_svc.normalize_execution(
        {"execution": {"goal": "g", "steps": [{"text": "A"}, {"text": "B"}], "outcome": "o"}},
        daily_minutes=30,
    )
    sid = doc["steps"][0]["id"]
    updated = expand_svc.set_step_done(doc, sid, True)
    assert updated["steps"][0]["done"] is True


def test_build_context_includes_resources():
    theme = Theme(
        title="t",
        goal="g",
        resources_doc={
            "resources": [{"name": "书A", "how_to_use": "先读"}],
            "order": [0],
        },
    )
    act = Activity(slice_id="s", theme_id="t", title="活动", description="描述")
    ctx = expand_svc.build_context(theme, act, daily_minutes=30)
    assert ctx["resources"][0]["name"] == "书A"
    assert ctx["activity"]["title"] == "活动"
