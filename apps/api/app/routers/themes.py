from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Theme, ThemeStatus
from app.schemas import ThemeCreate, ThemeOut, ThemeUpdate
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
