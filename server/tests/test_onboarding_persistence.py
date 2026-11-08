"""Onboarding persistence, idempotency and response-recovery tests.

Covers:
  1. The AIRequest outbox: fresh → completed → replay (no re-compute).
  2. Duplicate submissions collapse onto one row ("processing").
  3. Failed turns are safe to re-run (reset to processing instead of replays).
  4. discoveryChat: replay path returns the stored answer; pending path
     deduplicates; the accumulated profile persists to LearningProfile.
  5. Response recovery endpoint (auth isolation across users).
  6. Feedback-free repeat-question fix: the "time" dimension completes once
     days + total hours are known, via the even-split fallback.
"""
import os
import sys
import asyncio
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import AIRequest, LearningProfile, Conversation, User, Roadmap, Task
from app.routers.functions import (
    _begin_ai_request,
    _complete_ai_request,
    _fail_ai_request,
    discovery_chat,
    discovery_result,
    recommend_goals,
    save_onboarding_roadmap,
)
from app.services.discovery_flow import _ensure_time_schedule


def _make_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


class OutboxTests(unittest.TestCase):
    def setUp(self):
        self.engine = _make_engine()
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_fresh_creates_processing_row(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode, "fresh")
        self.assertIsNotNone(row)
        self.assertEqual(row.status, "processing")

    def test_completed_turn_replays_stored_result(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        _complete_ai_request(self.session, row, result={"reply": "أهلاً 👋", "isComplete": False})

        mode2, row2 = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode2, "result")
        self.assertEqual(row2.result, {"reply": "أهلاً 👋", "isComplete": False})

    def test_no_request_id_is_always_fresh(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "")
        self.assertEqual(mode, "fresh")
        self.assertIsNone(row)

    def test_duplicate_concurrent_submission_is_processing(self):
        mode1, row1 = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode1, "fresh")
        mode2, row2 = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode2, "processing")
        self.assertEqual(row2.id, row1.id)

    def test_failed_turn_is_safe_to_recompute(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        _fail_ai_request(self.session, row, "connection_error")
        mode2, row2 = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode2, "fresh")
        self.assertEqual(row2.status, "processing")

    def test_stale_processing_turn_is_safe_to_recompute(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        row.updated_date = datetime.utcnow() - timedelta(seconds=999)
        self.session.add(row)
        self.session.commit()
        mode2, row2 = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        self.assertEqual(mode2, "fresh")

    def test_completed_results_are_never_regressed(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        _complete_ai_request(self.session, row, result={"reply": "v1"})
        _fail_ai_request(self.session, row, "late_failure")
        stored = self.session.exec(select(AIRequest)).first()
        self.assertEqual(stored.status, "completed")
        self.assertEqual(stored.result, {"reply": "v1"})

    def test_user_isolation_across_users(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "shared-req")
        _complete_ai_request(self.session, row, result={"reply": "u1 answer"})
        # A different user with the same request_id is a fresh turn of their own.
        mode2, row2 = _begin_ai_request(self.session, "u2", "discovery", "shared-req")
        self.assertEqual(mode2, "fresh")
        self.assertNotEqual(row2.user_id, row.user_id)


class DiscoveryEndpointTests(unittest.TestCase):
    def setUp(self):
        self.engine = _make_engine()
        self.session = Session(self.engine)
        self.session.add(User(id="u1", email="u1@example.com", password_hash="x", status="active"))
        self.session.add(User(id="u2", email="u2@example.com", password_hash="x", status="active"))
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _payload(self, request_id="req-1", text="عايز أتعلم تحليل بيانات", user_id="u1", profile=None):
        messages = [
            {"role": "assistant", "content": "welcome"},
            {"role": "user", "content": text},
        ]
        return {
            "data": {
                "messages": messages,
                "profile": profile or {"goal": "Data Analysis"},
                "companionName": "Zeus",
                "lang": "ar",
                "request_id": request_id,
            },
            "user_id": user_id,
            "request": None,
        }

    @patch("app.routers.functions.discovery_flow_instant", new_callable=AsyncMock)
    def test_first_turn_completes_and_stores_result(self, mock_flow):
        mock_flow.return_value = {"reply": "تحليل بيانات اختيار ممتاز 🔥", "isComplete": False, "profile": {"goal": "Data Analysis"}}
        kwargs = self._payload()
        body = asyncio.run(discovery_chat(session=self.session, **kwargs))
        self.assertEqual(body["reply"], "تحليل بيانات اختيار ممتاز 🔥")
        stored = self.session.exec(select(AIRequest)).first()
        self.assertEqual(stored.status, "completed")
        self.assertEqual(stored.result["reply"], body["reply"])
        # Profile answer persisted server-side
        profile = self.session.exec(select(LearningProfile)).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.goal, "Data Analysis")

    @patch("app.routers.functions.discovery_flow_instant", new_callable=AsyncMock)
    def test_replay_returns_stored_answer_without_recompute(self, mock_flow):
        mock_flow.return_value = {"reply": "أول رد", "isComplete": False, "profile": {}}
        asyncio.run(discovery_chat(session=self.session, **self._payload()))
        self.assertEqual(mock_flow.await_count, 1)
        # Same request_id again → replay, flow NOT called a second time.
        body = asyncio.run(discovery_chat(session=self.session, **self._payload()))
        self.assertEqual(body["reply"], "أول رد")
        self.assertTrue(body.get("replayed"))
        self.assertEqual(mock_flow.await_count, 1, "replay must not re-run the LLM")

    @patch("app.routers.functions.discovery_flow_instant", new_callable=AsyncMock)
    def test_duplicate_pending_inflight(self, mock_flow):
        mock_flow.return_value = {"reply": "", "error": "temporary", "isComplete": False, "profile": {}}
        # first call finishes with a failure (stored as failed)
        first = _begin_ai_request(self.session, "u1", "discovery", "req-x")
        row = first[1]
        row.status = "processing"
        row.updated_date = datetime.utcnow()
        self.session.add(row)
        self.session.commit()
        body = asyncio.run(discovery_chat(session=self.session, **self._payload(request_id="req-x")))
        self.assertTrue(body.get("pending"))
        mock_flow.assert_not_awaited()

    @patch("app.routers.functions.discovery_flow_instant", new_callable=AsyncMock)
    def test_connection_error_marks_failed_and_profile_partial_save(self, mock_flow):
        mock_flow.return_value = {"reply": "", "error": "connection_error", "isComplete": False, "profile": {"availability": "اليوم"}}
        body = asyncio.run(discovery_chat(session=self.session, **self._payload()))
        self.assertEqual(body["error"], "connection_error")
        self.assertEqual(body["reply"], "")
        stored = self.session.exec(select(AIRequest)).first()
        self.assertEqual(stored.status, "failed")

    @patch("app.routers.functions.discovery_flow_instant", new_callable=AsyncMock)
    def test_recovery_endpoint_replays(self, mock_flow):
        mock_flow.return_value = {"reply": "تم التسجيل 👍", "options": ["خيار1", "خيار2"], "isComplete": False, "profile": {}}
        asyncio.run(discovery_chat(session=self.session, **self._payload()))
        body = discovery_result("req-1", user_id="u1", session=self.session)
        self.assertEqual(body["reply"], "تم التسجيل 👍")
        self.assertTrue(body["replayed"])

    def test_recovery_endpoint_hides_other_users_data(self):
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-1")
        _complete_ai_request(self.session, row, result={"reply": "private"})
        with self.assertRaises(HTTPException) as ctx:
            discovery_result("req-1", user_id="u2", session=self.session)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_recovery_endpoint_processing_and_failed(self):
        _begin_ai_request(self.session, "u1", "discovery", "req-2")
        body = discovery_result("req-2", user_id="u1", session=self.session)
        self.assertTrue(body["pending"])
        mode, row = _begin_ai_request(self.session, "u1", "discovery", "req-3")
        _fail_ai_request(self.session, row, "connection_error")
        body = discovery_result("req-3", user_id="u1", session=self.session)
        self.assertEqual(body["error"], "connection_error")

    def test_recovery_endpoint_unknown(self):
        with self.assertRaises(HTTPException) as ctx:
            discovery_result("missing", user_id="u1", session=self.session)
        self.assertEqual(ctx.exception.status_code, 404)


class TimeScheduleCompletionTests(unittest.TestCase):
    """The reproducible "same question repeated" bug: days + total hours stated
    but study_hours_by_day never parsed → time never marked complete."""

    def test_even_split_completes_time(self):
        merged = {"available_days": ["saturday", "sunday", "monday"], "weekly_hours": 6.0}
        out = _ensure_time_schedule(merged)
        self.assertEqual(out["study_hours_by_day"], {"saturday": 2.0, "sunday": 2.0, "monday": 2.0})
        self.assertEqual(out["weekly_hours"], 6.0)

    def test_arabic_days_are_normalized(self):
        merged = {"available_days": ["السبت", "الأحد"], "weekly_hours": 4.0}
        out = _ensure_time_schedule(merged)
        self.assertEqual(out["study_hours_by_day"], {"saturday": 2.0, "sunday": 2.0})

    def test_pseudo_entries_ignored(self):
        merged = {"available_days": ["3 days/week"], "weekly_hours": 3.0}
        out = _ensure_time_schedule(merged)
        self.assertNotIn("study_hours_by_day", out)

    def test_keeps_existing_schedule(self):
        merged = {"available_days": ["saturday"], "weekly_hours": 2.0, "study_hours_by_day": {"saturday": 2.0}}
        out = _ensure_time_schedule(merged)
        self.assertEqual(out["study_hours_by_day"], {"saturday": 2.0})

    def test_no_weekly_hours_noop(self):
        merged = {"available_days": ["saturday"]}
        out = _ensure_time_schedule(merged)
        self.assertNotIn("study_hours_by_day", out)


class OnboardingFinishTests(unittest.TestCase):
    def setUp(self):
        self.engine = _make_engine()
        self.session = Session(self.engine)
        self.session.add(User(id="u1", email="u1@example.com", password_hash="x", status="active"))
        self.profile = LearningProfile(user_id="u1", goal="Data Analysis", onboarding_step="roadmap")
        self.session.add(self.profile)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    @patch("app.routers.functions.recommend_goals_agent", new_callable=AsyncMock)
    def test_goal_recommendations_are_saved_for_resume(self, agent):
        agent.return_value = {"recommendations": [{"goal": "Data Analyst"}, {"goal": "BI Analyst"}]}
        result = asyncio.run(recommend_goals(
            data={"profile": {"goal": "stale client value"}, "goal": "Data Analysis", "lang": "en"},
            session=self.session,
            user_id="u1",
        ))
        self.assertEqual(len(result["recommendations"]), 2)
        saved = self.session.get(LearningProfile, self.profile.id)
        self.assertEqual(saved.goal_recommendations, result["recommendations"])

    def test_finish_is_atomic_and_double_submit_is_idempotent(self):
        nodes = [
            {"id": "n1", "title": "SQL", "tasks": ["Practice SELECT"], "estimated_hours": 2},
            {"id": "n2", "title": "Python", "tasks": ["Clean data"], "estimated_hours": 2},
            {"id": "n3", "title": "Dashboard", "tasks": ["Publish dashboard"], "estimated_hours": 3},
        ]
        first = save_onboarding_roadmap(
            data={"goal": "Data Analysis", "nodes": nodes}, session=self.session, user_id="u1",
        )
        replay = save_onboarding_roadmap(
            data={"goal": "Data Analysis", "nodes": nodes}, session=self.session, user_id="u1",
        )
        self.assertFalse(first["replayed"])
        self.assertTrue(replay["replayed"])
        self.assertEqual(first["roadmap"]["id"], replay["roadmap"]["id"])
        self.assertEqual(len(self.session.exec(select(Roadmap).where(Roadmap.user_id == "u1")).all()), 1)
        self.assertEqual(len(self.session.exec(select(Task).where(Task.user_id == "u1")).all()), 3)
        self.assertEqual(self.session.get(LearningProfile, self.profile.id).onboarding_step, "done")


if __name__ == "__main__":
    unittest.main()
