"""Unit tests for cocreate post-process helpers."""

from app.services import cocreate_post as post


def test_parse_resource_count():
    assert post.parse_resource_count_request("只要 3 份资料") == 3
    assert post.parse_resource_count_request("精简到2本") == 2
    assert post.parse_resource_count_request("随便聊聊") is None


def test_parse_daily_minutes():
    assert post.parse_daily_minutes_request("每天最多 45 分钟") == 45
    assert post.parse_daily_minutes_request("每天20分钟") == 20
    assert post.parse_daily_minutes_request("30分钟每天") == 30
    assert post.parse_daily_minutes_request("无时长") is None


def test_enforce_resource_count_trims():
    doc = {
        "resources": [{"name": f"r{i}"} for i in range(5)],
        "order": [0, 1, 2, 3, 4],
        "target_count": 5,
    }
    out = post.enforce_resource_count(doc, 3)
    assert len(out["resources"]) == 3
    assert out["target_count"] == 3
    assert out["order"] == [0, 1, 2]


def test_cap_phase_activities():
    doc = {
        "phases": {
            "learning": {"activities": [{"title": str(i)} for i in range(10)]},
            "practice": {"activities": [{"title": str(i)} for i in range(8)]},
            "application": {"activities": [{"title": str(i)} for i in range(5)]},
        }
    }
    out = post.cap_phase_activities(doc, learning_max=6, practice_max=4, application_max=3)
    assert len(out["phases"]["learning"]["activities"]) == 6
    assert len(out["phases"]["practice"]["activities"]) == 4
    assert len(out["phases"]["application"]["activities"]) == 3


def test_force_daily_minutes():
    doc = {
        "daily_minutes": 30,
        "phase_minutes": {"learning": 120, "practice": 30, "application": 30},
        "phases": {
            "practice": {"activities": [{"title": "a", "minutes": 30}]},
            "application": {"activities": [{"title": "b", "minutes": 30}]},
        },
    }
    out = post.force_daily_minutes(doc, 45)
    assert out["daily_minutes"] == 45
    assert out["phase_minutes"]["practice"] == 45
    assert out["phases"]["practice"]["activities"][0]["minutes"] == 45


def test_annotate_unverified():
    doc = {
        "resources": [
            {"name": "AI产品评测：从入门到精通", "type": "book"},
            {"name": "概念对照卡", "type": "ai_pack"},
        ]
    }
    out = post.annotate_unverified_resources(doc)
    assert out["resources"][0].get("verification") == "unverified"
    assert "待核验" in (out["resources"][0].get("warning") or "")
    assert out["resources"][1].get("verification") is None
