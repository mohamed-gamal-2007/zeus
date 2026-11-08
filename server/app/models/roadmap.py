from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import BigInteger, Column, JSON, UniqueConstraint
import uuid
from datetime import datetime

class Roadmap(SQLModel, table=True):
    __tablename__ = "roadmaps"
    # A continuation is a single next step for a completed roadmap.  Keeping
    # this constraint in the database, rather than relying only on a UI
    # disabled state, makes double clicks and concurrent requests idempotent.
    __table_args__ = (
        UniqueConstraint("user_id", "parent_roadmap_id", name="uq_roadmaps_user_parent"),
    )
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    goal: str
    version: int = Field(default=1, sa_column=Column(BigInteger, nullable=False, default=1))
    status: str = Field(default="active")
    parent_roadmap_id: Optional[str] = Field(default=None, index=True)
    sequence_order: int = Field(default=1, sa_column=Column(BigInteger, nullable=False, default=1))
    completed_date: Optional[datetime] = None
    track_name: Optional[str] = None
    nodes: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    video_preference: str = Field(default="free")
    quality_score: float = Field(default=0.0)
    reviewed_at: Optional[datetime] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
