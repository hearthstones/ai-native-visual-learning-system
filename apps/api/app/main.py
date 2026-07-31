from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import cocreate, home, settings as settings_router, themes

settings = get_settings()

app = FastAPI(title="AI Native Visual Learning System", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(home.router, prefix="/api")
app.include_router(themes.router, prefix="/api")
app.include_router(cocreate.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
