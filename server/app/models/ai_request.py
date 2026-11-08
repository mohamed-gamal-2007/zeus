from typing import Optional
from datetime import datetime
import uuid

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON, UniqueConstraint


class AIRequest(SQLModel, table=True):
    """Idempotency + response-recovery record for onboarding AI requests.

    Row per (user_id, request_id):
      - `processing` while the LLM turn is in flight (created BEFORE any LLM
        call begins, committed immediately).
      - `completed` once a reply was produced — the full response body is
        stored in `result` so a client that timed out, aborted, or lost the
        connection can retrieve the exact same answer (replay) without
        spending another LLM call / token.
      - `failed` when all providers failed (no output produced) — safe for a
        client retry to re-run.

    Duplicate submissions collide on the (user_id, request_id) unique
    constraint, so double-clicks or concurrent retries never double-consume.
    """
    __tablename__ = "ai_requests"
    __table_args__ = (
        UniqueConstraint("user_id", "request_id", name="uq_ai_requests_user_request"),
    )

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    kind: str = Field(default="discovery", index=True)  # discovery | partner_intake
    request_id: str = Field(index=True)
    status: str = Field(default="processing", index=True)  # processing | completed | failed
    result: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
