"""Unit tests for WeRead resource enrichment matching."""

from app.services.weread import (
    is_book_like_resource,
    normalize_book_title,
    pick_matching_book,
    sanitize_weread_bindings,
    titles_compatible,
)


def test_normalize_book_title():
    assert normalize_book_title("《涛动周期论》") == "涛动周期论"
    assert normalize_book_title("人生发财靠康波") == "人生发财靠康波"


def test_titles_compatible_rejects_topical_neighbors():
    assert titles_compatible("《涛动周期论》", "涛动周期论")
    assert not titles_compatible("《涛动周期论》", "人生发财靠康波")


def test_is_book_like_skips_packs_and_scripts():
    assert is_book_like_resource({"name": "《涛动周期论》", "type": "book"})
    assert not is_book_like_resource({"name": "康波分析提纲生成脚本", "type": "script"})
    assert not is_book_like_resource({"name": "AI Agent 四大组件概念对照卡", "type": "ai_pack"})
    assert not is_book_like_resource({"name": "两周主题阅读行动脚本", "type": "other"})


def test_pick_matching_book_requires_title_match():
    hits = [
        {"title": "人生发财靠康波", "deepLink": "weread://a"},
        {"title": "涛动周期论", "deepLink": "weread://b"},
    ]
    picked = pick_matching_book("《涛动周期论》", hits)
    assert picked is not None
    assert picked["deepLink"] == "weread://b"
    assert pick_matching_book("《涛动周期论》", hits[:1]) is None


def test_sanitize_clears_pack_and_mismatched_bindings():
    resources = [
        {
            "name": "AI 学习包：概念对照卡",
            "type": "ai_pack",
            "weread_readable": True,
            "weread": {"title": "某本书", "deepLink": "weread://x"},
        },
        {
            "name": "《涛动周期论》",
            "type": "book",
            "weread_readable": True,
            "weread": {"title": "人生发财靠康波", "deepLink": "weread://y"},
        },
        {
            "name": "《如何阅读一本书》",
            "type": "book",
            "weread_readable": True,
            "weread": {"title": "如何阅读一本书", "deepLink": "weread://z"},
        },
    ]
    out = sanitize_weread_bindings(resources)
    assert out[0].get("weread") is None
    assert out[0]["weread_readable"] is False
    assert out[1].get("weread") is None
    assert "不一致" in str(out[1].get("warning") or "")
    assert out[2]["weread"]["deepLink"] == "weread://z"
