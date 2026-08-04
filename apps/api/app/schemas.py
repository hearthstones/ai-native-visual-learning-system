from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app import plan_defaults
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
    previous_status: Optional[ThemeStatus] = None
    current_ladder_level: Optional[int]
    ladder_doc: dict[str, Any]
    resources_doc: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    locked_at: Optional[datetime]

    class Config:
        from_attributes = True


class PlanPrefs(BaseModel):
    """User-chosen durations before plan generation."""

    learning_duration: str = plan_defaults.DEFAULT_LEARNING_DURATION
    practice_duration: str = plan_defaults.DEFAULT_PRACTICE_DURATION
    application_duration: str = plan_defaults.DEFAULT_APPLICATION_DURATION
    daily_minutes: int = Field(default=plan_defaults.DEFAULT_DAILY_MINUTES, ge=10, le=180)


class CocreateStart(BaseModel):
    kind: CocreateKind
    resource_count: Optional[int] = Field(default=None, ge=1, le=20)
    plan_prefs: Optional[PlanPrefs] = None
    force: bool = False


class CocreateMessageIn(BaseModel):
    content: str = Field(min_length=1)


class SettingsUpdate(BaseModel):
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: Optional[str] = None
    deepseek_model: Optional[str] = None
    weread_api_key: Optional[str] = None


class SettingsOut(BaseModel):
    provider: str
    deepseek_api_key_configured: bool
    deepseek_api_key_masked: str
    deepseek_base_url: str
    deepseek_model: str
    model_options: list[dict[str, str]]
    weread_configured: bool
    weread_api_key_masked: str = ""


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


class WeeklyReviewIn(BaseModel):
    answers: list[str] = Field(default_factory=list)
    mastery: list[dict[str, Any]] = Field(default_factory=list)
    draft_notes: str = ""


class WeeklyReviewOut(BaseModel):
    id: str
    week_start: str
    summary: str
    wins: list[Any]
    issues: list[Any]
    adjustments: list[Any]

    class Config:
        from_attributes = True


class ActivityOut(BaseModel):
    id: str
    title: str
    description: str
    activity_type: Optional[str] = None
    done: bool
    sort_order: int

    class Config:
        from_attributes = True


class ActiveSliceOut(BaseModel):
    id: Optional[str] = None
    theme_id: str
    phase: Optional[ThemePhase] = None
    title: str = ""
    core_points: list[Any] = Field(default_factory=list)
    activities: list[ActivityOut] = Field(default_factory=list)
    daily_minutes: int = plan_defaults.DEFAULT_DAILY_MINUTES


class ActivityToggle(BaseModel):
    done: bool


class WereadSearchOut(BaseModel):
    books: list[Any]
