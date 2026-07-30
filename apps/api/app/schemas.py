from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models import (
    CocreateKind,
    ThemePhase,
    ThemeStatus,
    ThemeType,
)


class ThemeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    theme_type: ThemeType = ThemeType.general
    goal: str = ""


class ThemeUpdate(BaseModel):
    title: Optional[str] = None
    goal: Optional[str] = None
    status: Optional[ThemeStatus] = None
    is_focus: Optional[bool] = None
    current_ladder_level: Optional[int] = None


class ThemeOut(BaseModel):
    id: str
    title: str
    theme_type: ThemeType
    goal: str
    phase: ThemePhase
    status: ThemeStatus
    is_focus: bool
    current_ladder_level: Optional[int]
    ladder_doc: dict[str, Any]
    resources_doc: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    locked_at: Optional[datetime]

    class Config:
        from_attributes = True


class CocreateStart(BaseModel):
    kind: CocreateKind


class CocreateMessageIn(BaseModel):
    content: str = Field(min_length=1)


class CocreateConfirmIn(BaseModel):
    selected_level: Optional[int] = None
    live_doc: Optional[dict[str, Any]] = None


class CocreateSessionOut(BaseModel):
    id: str
    theme_id: str
    kind: CocreateKind
    messages: list[Any]
    live_doc: dict[str, Any]
    confirmed: bool

    class Config:
        from_attributes = True


class TaskToggle(BaseModel):
    done: bool


class DailyTaskOut(BaseModel):
    id: str
    theme_id: str
    activity_id: Optional[str]
    title: str
    description: str
    task_date: str
    done: bool
    sort_order: int

    class Config:
        from_attributes = True


class HomeOut(BaseModel):
    slots: dict[str, Any]
    focus_count: int
    themes: list[ThemeOut]
    today_tasks: list[DailyTaskOut]
    drift_events: list[dict[str, Any]]


class WeeklyReviewOut(BaseModel):
    id: str
    week_start: str
    summary: str
    wins: list[Any]
    issues: list[Any]
    adjustments: list[Any]

    class Config:
        from_attributes = True


class WereadSearchOut(BaseModel):
    books: list[Any]
