from functools import lru_cache
import hashlib
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILLS_DIR = REPO_ROOT / "skills"
DATA_DIR = REPO_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"

    weread_api_key: str = ""
    weread_gateway_url: str = "https://i.weread.qq.com/api/agent/gateway"
    weread_skill_version: str = "1.0.4"

    database_url: str = f"sqlite:///{DATA_DIR / 'learning.db'}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 单人门禁：在 .env 设置 AUTH_PASSWORD 后启用（用户名默认 admin）
    auth_username: str = "admin"
    auth_password: str = ""
    auth_secret: str = ""
    # None=按请求是否 HTTPS 自动；True/False 可强制
    auth_cookie_secure: bool | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def auth_enabled(self) -> bool:
        return bool(self.auth_password.strip())

    @property
    def session_secret(self) -> str:
        if self.auth_secret.strip():
            return self.auth_secret.strip()
        # 未单独配置时，由账号口令派生，改密后旧 cookie 自动失效
        raw = f"{self.auth_username}:{self.auth_password}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@lru_cache
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
