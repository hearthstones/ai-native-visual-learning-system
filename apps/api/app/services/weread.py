from __future__ import annotations

import re
from typing import Any

import httpx

from app.config import Settings

_NON_BOOK_TYPES = frozenset(
    {"ai_pack", "script", "course", "video", "doc", "docs", "tool", "other"}
)
_NON_BOOK_NAME_MARKERS = (
    "学习包",
    "脚本",
    "对照卡",
    "病例",
    "病例集",
    "示例",
    "提纲",
    "清单",
    "检查清单",
)


class WereadError(RuntimeError):
    pass


def weread_call(
    settings: Settings,
    api_name: str,
    **params: Any,
) -> dict[str, Any]:
    if not settings.weread_api_key:
        raise WereadError(
            "未配置 WEREAD_API_KEY。请在仓库根目录 .env 中设置（格式 wrk-...）后重启 API。"
        )
    body = {
        "api_name": api_name,
        "skill_version": settings.weread_skill_version,
        **params,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            settings.weread_gateway_url,
            headers={
                "Authorization": f"Bearer {settings.weread_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    if isinstance(data, dict) and data.get("upgrade_info"):
        raise WereadError(str(data["upgrade_info"].get("message", data["upgrade_info"])))
    if isinstance(data, dict) and data.get("errcode") not in (None, 0, "0"):
        raise WereadError(data.get("errmsg") or f"微信读书错误: {data.get('errcode')}")
    return data


def search_books(settings: Settings, keyword: str, count: int = 10) -> list[dict[str, Any]]:
    """Return a flat list of bookInfo-like dicts from WeRead search V3."""
    data = weread_call(
        settings,
        "/store/search",
        keyword=keyword,
        count=count,
        scope=10,  # 电子书
    )
    # Legacy shape
    books = data.get("books")
    if isinstance(books, list) and books:
        return books

    # V3 shape: results[].books[].bookInfo
    out: list[dict[str, Any]] = []
    results = data.get("results") or []
    if isinstance(results, list):
        for group in results:
            if not isinstance(group, dict):
                continue
            for item in group.get("books") or []:
                if not isinstance(item, dict):
                    continue
                info = item.get("bookInfo") or item.get("book") or item
                if isinstance(info, dict):
                    out.append(info)
    return out


def normalize_book_title(text: str) -> str:
    s = (text or "").strip().lower()
    s = re.sub(r"[《》「」『』【】\[\]()（）\s·・.\-_—:：,，、]", "", s)
    return s


def titles_compatible(resource_name: str, book_title: str) -> bool:
    """Require a real title match; never accept unrelated topical neighbors."""
    a = normalize_book_title(resource_name)
    b = normalize_book_title(book_title)
    if not a or not b:
        return False
    if a == b:
        return True
    # Containment only when both sides are long enough to avoid short false positives.
    if min(len(a), len(b)) >= 4 and (a in b or b in a):
        return True
    return False


def is_book_like_resource(item: dict[str, Any]) -> bool:
    """Only real books should be WeRead-enriched / opened as deep links."""
    rtype = str(item.get("type") or "").strip().lower()
    name = str(item.get("name") or "")
    if rtype in _NON_BOOK_TYPES:
        return False
    if any(marker in name for marker in _NON_BOOK_NAME_MARKERS):
        return False
    if rtype in ("book", "article"):
        return True
    if "《" in name and "》" in name:
        return True
    return False


def pick_matching_book(resource_name: str, hits: list[dict[str, Any]]) -> dict[str, Any] | None:
    for book in hits:
        title = str(book.get("title") or book.get("bookTitle") or "")
        if titles_compatible(resource_name, title):
            return book
    return None


def _clear_weread(copy: dict[str, Any]) -> dict[str, Any]:
    copy["weread_readable"] = False
    copy.pop("weread", None)
    return copy


def enrich_resources_with_weread(
    settings: Settings,
    resources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for item in resources:
        name = str(item.get("name") or "")
        copy = dict(item)
        if not name:
            enriched.append(copy)
            continue
        if not is_book_like_resource(copy):
            enriched.append(_clear_weread(copy))
            continue
        # Strip book-title ornaments for better search recall
        query = name.replace("《", "").replace("》", "").strip()
        try:
            hits = search_books(settings, query, count=8)
            book = pick_matching_book(name, hits) if hits else None
            if book:
                copy["weread_readable"] = True
                copy["weread"] = {
                    "bookId": book.get("bookId") or book.get("bookid"),
                    "title": book.get("title") or book.get("bookTitle"),
                    "author": book.get("author"),
                    "deepLink": book.get("deepLink") or book.get("deeplink"),
                }
            else:
                _clear_weread(copy)
                warn = str(copy.get("warning") or "")
                if "微信读书未匹配到同名书" not in warn:
                    copy["warning"] = (
                        (warn + "；微信读书未匹配到同名书，请勿点开无关书目").strip("；")
                    )
        except WereadError:
            copy.setdefault("weread_readable", False)
        enriched.append(copy)
    return enriched


def sanitize_weread_bindings(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop wrong / non-book WeRead bindings from already-saved resources."""
    out: list[dict[str, Any]] = []
    for item in resources:
        if not isinstance(item, dict):
            out.append(item)
            continue
        copy = dict(item)
        if not is_book_like_resource(copy):
            out.append(_clear_weread(copy))
            continue
        weread = copy.get("weread")
        if isinstance(weread, dict):
            bound_title = str(weread.get("title") or "")
            if bound_title and not titles_compatible(str(copy.get("name") or ""), bound_title):
                _clear_weread(copy)
                warn = str(copy.get("warning") or "")
                if "书名与微信读书绑定不一致" not in warn:
                    copy["warning"] = (
                        (warn + "；书名与微信读书绑定不一致，已取消错误链接").strip("；")
                    )
        out.append(copy)
    return out
