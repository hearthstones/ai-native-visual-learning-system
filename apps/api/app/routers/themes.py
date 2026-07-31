from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Activity, Theme, ThemeStatus
from app.schemas import (
    ActiveSliceOut,
    ActivityOut,
    ActivityToggle,
    ThemeCreate,
    ThemeOut,
    ThemeUpdate,
)
from app.services import domain as domain_svc

router = APIRouter(prefix="/themes", tags=["themes"])


@router.get("", response_model=list[ThemeOut])
def list_themes(session: Session = Depends(get_session)) -> list[Theme]:
    return list(session.exec(select(Theme).order_by(Theme.updated_at.desc())).all())


@router.post("", response_model=ThemeOut)
def create_theme(body: ThemeCreate, session: Session = Depends(get_session)) -> Theme:
    # Creating a new learning-phase theme will occupy learning slot only after lock.
    # Soft check: if active learning already full, still allow draft create but UI should intercept.
    theme = Theme(
        title=body.title.strip(),
        theme_type=body.theme_type,
        goal=body.goal.strip(),
        status=ThemeStatus.draft,
    )
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.get("/{theme_id}", response_model=ThemeOut)
def get_theme(theme_id: str, session: Session = Depends(get_session)) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    return theme


@router.patch("/{theme_id}", response_model=ThemeOut)
def update_theme(
    theme_id: str,
    body: ThemeUpdate,
    session: Session = Depends(get_session),
) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    data = body.model_dump(exclude_unset=True)
    if "is_focus" in data:
        try:
            domain_svc.set_focus(session, theme, bool(data.pop("is_focus")))
        except ValueError as e:
            raise HTTPException(409, str(e)) from e
    if "status" in data and data["status"] in (
        ThemeStatus.dormant,
        ThemeStatus.archived,
    ):
        theme.is_focus = False
    for k, v in data.items():
        setattr(theme, k, v)
    theme.updated_at = datetime.utcnow()
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.post("/{theme_id}/advance-phase", response_model=ThemeOut)
def advance_phase(theme_id: str, session: Session = Depends(get_session)) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    if theme.status != ThemeStatus.active:
        raise HTTPException(400, "仅活跃主题可切换阶段")
    try:
        domain_svc.advance_phase(session, theme)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.get("/{theme_id}/active-slice", response_model=ActiveSliceOut)
def get_active_slice(theme_id: str, session: Session = Depends(get_session)) -> ActiveSliceOut:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    slice_row = domain_svc.get_active_slice(session, theme_id)
    if not slice_row:
        return ActiveSliceOut(theme_id=theme_id, title="", activities=[])
    activities = list(
        session.exec(
            select(Activity)
            .where(Activity.slice_id == slice_row.id)
            .order_by(col(Activity.sort_order))
        ).all()
    )
    return ActiveSliceOut(
        id=slice_row.id,
        theme_id=theme_id,
        phase=slice_row.phase,
        title=slice_row.title,
        core_points=list(slice_row.core_points or []),
        activities=[
            ActivityOut(
                id=a.id,
                title=a.title,
                description=a.description,
                activity_type=a.activity_type.value if a.activity_type else None,
                done=a.done,
                sort_order=a.sort_order,
            )
            for a in activities
        ],
    )


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
def toggle_activity(
    activity_id: str,
    body: ActivityToggle,
    session: Session = Depends(get_session),
) -> Activity:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    act.done = body.done
    session.add(act)
    session.commit()
    session.refresh(act)
    return ActivityOut(
        id=act.id,
        title=act.title,
        description=act.description,
        activity_type=act.activity_type.value if act.activity_type else None,
        done=act.done,
        sort_order=act.sort_order,
    )
