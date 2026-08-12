from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.auth_session import read_session_user
from app.config import get_settings
from app.db import init_db
from app.routers import auth as auth_router
from app.routers import cocreate, home, settings as settings_router, themes

settings = get_settings()

# 未登录也可访问
_PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/me",
    "/api/auth/login",
    "/api/auth/logout",
}

_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}


class NoStoreCacheMiddleware(BaseHTTPMiddleware):
    """主题列表等会随状态变更立即失效，禁止中间层/浏览器缓存 GET。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


class AuthGateMiddleware(BaseHTTPMiddleware):
    """当 .env 配置了 AUTH_PASSWORD 时，保护 /api/*（登录相关与 health 除外）及文档面。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        cfg = get_settings()

        if cfg.auth_enabled and path in _DOCS_PATHS:
            if not read_session_user(request, cfg):
                return JSONResponse(status_code=401, content={"detail": "未登录"})

        if not path.startswith("/api/"):
            return await call_next(request)

        if not cfg.auth_enabled:
            return await call_next(request)

        if path in _PUBLIC_API_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        if read_session_user(request, cfg):
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "未登录"})


app = FastAPI(title="AI Native Visual Learning System", version="0.3.0")
# 后添加的中间件更靠外：Auth 先于 Cache / CORS 处理
app.add_middleware(NoStoreCacheMiddleware)
app.add_middleware(AuthGateMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api")
app.include_router(home.router, prefix="/api")
app.include_router(themes.router, prefix="/api")
app.include_router(cocreate.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
