from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas import SettingsOut, SettingsUpdate
from app.services import env_store
from app.services.llm import get_llm_client

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings_api() -> dict:
    return env_store.get_llm_settings_public()


@router.patch("", response_model=SettingsOut)
def patch_settings_api(body: SettingsUpdate) -> dict:
    return env_store.apply_llm_settings(
        deepseek_api_key=body.deepseek_api_key,
        deepseek_base_url=body.deepseek_base_url,
        deepseek_model=body.deepseek_model,
        weread_api_key=body.weread_api_key,
    )


@router.post("/test-llm")
def test_llm_api() -> dict:
    """轻量连通性探测：先拉模型列表，再发一条极短补全（不用 JSON mode）。"""
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise HTTPException(400, "尚未配置 DeepSeek API Key")
    client = get_llm_client(settings)
    try:
        listed = client.models.list()
        model_ids = [m.id for m in (listed.data or [])][:8]
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "Connection" in msg or "connect" in msg.lower():
            raise HTTPException(
                502,
                "无法连接到 DeepSeek（网络或 Base URL 有误）。请检查本机网络与 Base URL。",
            ) from e
        if "401" in msg or "Unauthorized" in msg or "invalid" in msg.lower():
            raise HTTPException(502, f"API Key 可能无效：{msg}") from e
        raise HTTPException(502, f"拉取模型列表失败：{msg}") from e

    if settings.deepseek_model not in model_ids and model_ids:
        # 仍尝试补全；有些账号列表不全
        pass

    try:
        completion = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {
                    "role": "user",
                    "content": "只回复一个字：通",
                }
            ],
            temperature=0,
            max_tokens=8,
            extra_body={"thinking": {"type": "disabled"}},
        )
        reply = (completion.choices[0].message.content or "").strip()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "Connection" in msg or "connect" in msg.lower():
            raise HTTPException(
                502,
                "模型列表可达，但补全请求失败（网络抖动或模型名不可用）。"
                f" 当前模型：{settings.deepseek_model}。详情：{msg}",
            ) from e
        raise HTTPException(502, f"模型补全失败：{msg}") from e

    return {
        "ok": True,
        "model": settings.deepseek_model,
        "models": model_ids,
        "echo": {"reply": reply},
    }
