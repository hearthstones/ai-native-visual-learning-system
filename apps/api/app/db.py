from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_settings = get_settings()
engine = create_engine(
    _settings.database_url,
    connect_args={"check_same_thread": False},
)


def _migrate_theme_status_v2() -> None:
    """One-time: old archived(=废弃) → abandoned; add previous_status column."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_meta ("
                "key TEXT PRIMARY KEY, value TEXT)"
            )
        )
        row = conn.execute(
            text("SELECT value FROM schema_meta WHERE key = 'theme_status_v2'")
        ).fetchone()
        if row is None:
            # 旧版 archived 语义为「废弃」，迁移到 abandoned；archived 留给真正的归档
            conn.execute(
                text("UPDATE theme SET status = 'abandoned' WHERE status = 'archived'")
            )
            conn.execute(
                text(
                    "INSERT INTO schema_meta (key, value) VALUES ('theme_status_v2', '1')"
                )
            )

        cols = {
            r[1]
            for r in conn.execute(text("PRAGMA table_info(theme)")).fetchall()
        }
        if "previous_status" not in cols:
            conn.execute(
                text("ALTER TABLE theme ADD COLUMN previous_status VARCHAR")
            )


def _migrate_activity_execution_v1() -> None:
    """为已有库补齐 Activity.execution_doc。"""
    with engine.begin() as conn:
        tables = {
            r[0]
            for r in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            ).fetchall()
        }
        if "activity" not in tables:
            return
        cols = {
            r[1]
            for r in conn.execute(text("PRAGMA table_info(activity)")).fetchall()
        }
        if "execution_doc" not in cols:
            conn.execute(
                text("ALTER TABLE activity ADD COLUMN execution_doc JSON DEFAULT '{}'")
            )


def _migrate_theme_work_note_v1() -> None:
    """为已有库补齐 Theme.work_note。"""
    with engine.begin() as conn:
        tables = {
            r[0]
            for r in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            ).fetchall()
        }
        if "theme" not in tables:
            return
        cols = {
            r[1]
            for r in conn.execute(text("PRAGMA table_info(theme)")).fetchall()
        }
        if "work_note" not in cols:
            conn.execute(text("ALTER TABLE theme ADD COLUMN work_note TEXT DEFAULT ''"))


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_theme_status_v2()
    _migrate_activity_execution_v1()
    _migrate_theme_work_note_v1()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
