"""Read/write selected keys in the repo-root .env without wiping unrelated entries."""

from __future__ import annotations

import os
import re
from pathlib import Path

from app.config import REPO_ROOT, get_settings

ENV_PATH = REPO_ROOT / ".env"

DEEPSEEK_MODEL_OPTIONS = [
    {"value": "deepseek-v4-flash", "label": "DeepSeek V4 Flash（默认）"},
    {"value": "deepseek-chat", "label": "DeepSeek Chat"},
    {"value": "deepseek-reasoner", "label": "DeepSeek Reasoner"},
]


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}…{key[-4:]}"


def upsert_env_keys(updates: dict[str, str], path: Path = ENV_PATH) -> None:
    """Merge updates into .env, preserving comments and unrelated keys."""
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    pending = dict(updates)
    out: list[str] = []

    key_re = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=")
    for line in existing_lines:
        m = key_re.match(line.strip())
        if m and m.group(1) in pending:
            key = m.group(1)
            out.append(f"{key}={pending.pop(key)}")
        else:
            out.append(line)

    if pending:
        if out and out[-1].strip():
            out.append("")
        for key, value in pending.items():
            out.append(f"{key}={value}")

    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def get_llm_settings_public() -> dict:
    settings = get_settings()
    return {
        "provider": "deepseek",
        "deepseek_api_key_configured": bool(settings.deepseek_api_key),
        "deepseek_api_key_masked": _mask_key(settings.deepseek_api_key),
        "deepseek_base_url": settings.deepseek_base_url,
        "deepseek_model": settings.deepseek_model,
        "model_options": DEEPSEEK_MODEL_OPTIONS,
        "weread_configured": bool(settings.weread_api_key),
        "weread_api_key_masked": _mask_key(settings.weread_api_key),
    }


def apply_llm_settings(
    *,
    deepseek_api_key: str | None = None,
    deepseek_base_url: str | None = None,
    deepseek_model: str | None = None,
    weread_api_key: str | None = None,
) -> dict:
    updates: dict[str, str] = {}
    current = get_settings()
    if deepseek_api_key is not None and deepseek_api_key.strip():
        # Ignore placeholder / masked values accidentally re-submitted
        if "…" not in deepseek_api_key and deepseek_api_key.strip() != _mask_key(
            current.deepseek_api_key
        ):
            updates["DEEPSEEK_API_KEY"] = deepseek_api_key.strip()
    if deepseek_base_url is not None and deepseek_base_url.strip():
        updates["DEEPSEEK_BASE_URL"] = deepseek_base_url.strip().rstrip("/")
    if deepseek_model is not None and deepseek_model.strip():
        updates["DEEPSEEK_MODEL"] = deepseek_model.strip()
    if weread_api_key is not None and weread_api_key.strip():
        if "…" not in weread_api_key and weread_api_key.strip() != _mask_key(
            current.weread_api_key
        ):
            updates["WEREAD_API_KEY"] = weread_api_key.strip()

    if updates:
        upsert_env_keys(updates)
        # Ensure runtime picks up changes even if keys were already in os.environ
        for key, value in updates.items():
            os.environ[key] = value
        get_settings.cache_clear()

    return get_llm_settings_public()
