from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings


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
        # Strip book-title ornaments for better search recall
        query = name.replace("《", "").replace("》", "").strip()
        try:
            hits = search_books(settings, query, count=5)
            if hits:
                book = hits[0]
                copy["weread_readable"] = True
                copy["weread"] = {
                    "bookId": book.get("bookId") or book.get("bookid"),
                    "title": book.get("title") or book.get("bookTitle"),
                    "author": book.get("author"),
                    "deepLink": book.get("deepLink") or book.get("deeplink"),
                }
            else:
                copy["weread_readable"] = False
        except WereadError:
            copy.setdefault("weread_readable", False)
        enriched.append(copy)
    return enriched
