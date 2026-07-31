from fastapi import APIRouter

from app.schemas import SettingsOut, SettingsUpdate
from app.services import env_store

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
    )
