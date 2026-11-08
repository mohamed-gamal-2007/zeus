from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class LearningRemediation(SQLModel, table=True):
    __tablename__ = "learning_remediations"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    roadmap_id: str = Field(index=True)
    lesson_id: Optional[str] = Field(default=None, index=True)
    overall_score: Optional[float] = None
    summary: str = Field(default="")
    strengths: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    weaknesses: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    remediation_plan: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    reassessment_status: str = Field(default="pending")
    reassessment_score: Optional[float] = None
    reassessment_feedback: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
