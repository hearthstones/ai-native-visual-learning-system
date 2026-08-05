from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return str(uuid4())


class ThemeType(str, Enum):
    general = "general"
    tech = "tech"


class ThemePhase(str, Enum):
    learning = "learning"
    practice = "practice"
    application = "application"


class ThemeStatus(str, Enum):
    """主题生命周期状态。

    draft 草稿 · active 进行 · dormant 休眠 · completed 完成
    abandoned 废弃 · archived 归档 · deleted 回收站（软删）
    """

    draft = "draft"
    active = "active"
    dormant = "dormant"
    completed = "completed"
    abandoned = "abandoned"
    archived = "archived"
    deleted = "deleted"


class SliceStatus(str, Enum):
    draft = "draft"
    active = "active"
    completed = "completed"


class ActivityType(str, Enum):
    learn = "learn"
    practice = "practice"
    apply = "apply"


class CocreateKind(str, Enum):
    stage = "stage"
    resources = "resources"
    plan = "plan"


PHASE_SLOT_LIMITS: dict[ThemePhase, int] = {
    ThemePhase.learning: 1,
    ThemePhase.practice: 3,
    ThemePhase.application: 5,
}

MAX_FOCUS = 3


class Theme(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    title: str
    theme_type: ThemeType = ThemeType.general
    goal: str = ""
    phase: ThemePhase = ThemePhase.learning
    status: ThemeStatus = ThemeStatus.draft
    is_focus: bool = False
    # 进入 archived / deleted 前的状态，用于恢复
    previous_status: Optional[ThemeStatus] = None
    current_ladder_level: Optional[int] = None
    ladder_doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    resources_doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    locked_at: Optional[datetime] = None


class PlanSlice(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    theme_id: str = Field(index=True)
    phase: ThemePhase
    slice_status: SliceStatus = SliceStatus.draft
    title: str = ""
    core_points: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class Activity(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    slice_id: str = Field(index=True)
    theme_id: str = Field(index=True)
    title: str
    description: str = ""
    activity_type: Optional[ActivityType] = None
    done: bool = False
    sort_order: int = 0
    # 单条计划的 AI 任务展开（长期复用）；空 = 未展开
    execution_doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DailyTask(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    theme_id: str = Field(index=True)
    activity_id: Optional[str] = Field(default=None, index=True)
    title: str
    description: str = ""
    task_date: str = Field(index=True)  # YYYY-MM-DD
    done: bool = False
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DriftEvent(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    kind: str = "focus_over_one"
    message: str
    theme_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CocreateSession(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    theme_id: str = Field(index=True)
    kind: CocreateKind
    messages: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    live_doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    confirmed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WeeklyReview(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    week_start: str  # YYYY-MM-DD (Monday)
    summary: str = ""
    wins: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    issues: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    adjustments: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    raw: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
