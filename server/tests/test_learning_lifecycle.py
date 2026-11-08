import asyncio
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.models import (
    User, Roadmap, Lesson, LessonProgress, LearningProfile,
    LearningRemediation, Notification, Project, CV
)
from app.routers import functions, admin


class LearningLifecycleTests(unittest.TestCase):
    def setUp(self):
        # In-memory SQLite database for test isolation
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)

        # Seed Admin user
        self.admin = User(
            id="admin-1",
            email="admin@zeus.local",
            full_name="Zeus Admin",
            role="admin",
            status="active",
        )
        self.session.add(self.admin)

        # Seed Student user
        self.student = User(
            id="student-1",
            email="student@zeus.local",
            full_name="Ahmed Student",
            role="learner",
            status="active",
            subscription_plan="pro",
            subscription_status="active",
        )
        self.session.add(self.student)

        # Seed LearningProfile
        self.profile = LearningProfile(
            user_id="student-1",
            goal="Full Stack Web Development",
            career_intent="Full Stack Developer",
            current_level="intermediate",
            known_skills=["JavaScript", "HTML"],
            skill_graph=[
                {"skill": "JavaScript", "level": 85},
                {"skill": "React Hooks", "level": 55},  # Weak skill
                {"skill": "SQL Indexing", "level": 40},  # Weak skill
            ],
        )
        self.session.add(self.profile)

        # Seed Roadmap 1
        self.roadmap1 = Roadmap(
            id="roadmap-1",
            user_id="student-1",
            goal="Full Stack Web Development",
            status="active",
            sequence_order=1,
            track_name="Full Stack Web Development",
            nodes=[
                {"id": "n1", "title": "React Basics", "skills": ["React Hooks"]},
                {"id": "n2", "title": "Database Optimization", "skills": ["SQL Indexing"]},
                {"id": "stage_project_final", "title": "Capstone Project", "skills": ["Full Stack"]},
            ],
        )
        self.session.add(self.roadmap1)

        # Seed Lessons
        self.lesson1 = Lesson(
            id="lesson-1",
            user_id="student-1",
            roadmap_id="roadmap-1",
            node_id="n1",
            node_title="React Basics",
            status="completed",
            quiz_passed=True,
            quiz_score=90,
        )
        self.lesson2 = Lesson(
            id="lesson-2",
            user_id="student-1",
            roadmap_id="roadmap-1",
            node_id="n2",
            node_title="Database Optimization",
            status="completed",
            quiz_passed=True,
            quiz_score=60,
        )
        self.capstone = Lesson(
            id="lesson-capstone",
            user_id="student-1",
            roadmap_id="roadmap-1",
            node_id="stage_project_final",
            node_title="Capstone Project",
            status="available",
            quiz_passed=False,
            task={"title": "E-Commerce Full Stack App", "description": "Build end-to-end e-commerce store with checkout"},
        )
        self.session.add_all([self.lesson1, self.lesson2, self.capstone])

        # Seed LessonProgress with real quiz error history
        self.prog2 = LessonProgress(
            user_id="student-1",
            lesson_id="lesson-2",
            quiz_score=60,
            quiz_answers={
                "history": [
                    {
                        "score": 60,
                        "feedback": [
                            {
                                "topic": "B-Tree Indexes",
                                "correct": False,
                                "question": "When does a database engine skip a B-Tree index scan?",
                                "student_answer": "When using = operator",
                                "explanation": "B-Tree indexes are skipped when functions or leading wildcards are applied.",
                            }
                        ]
                    }
                ]
            }
        )
        self.session.add(self.prog2)
        self.session.commit()

        # Bypass tier check for test harness
        self.tier_patch = patch.object(functions, "_enforce_function_tier")
        self.tier_patch.start()
        self.addCleanup(self.tier_patch.stop)

    def tearDown(self):
        self.session.close()

    # =========================================================================
    # FEATURE 1 TESTS: Remediation & Graduation Project
    # =========================================================================

    def test_capstone_gating_and_approval(self):
        """Capstone must be approved with >= 70 score to complete the lesson."""
        # Test rejection if mentor score < 70
        with (
            patch.object(functions, "_enforce_stage_project_access"),
            patch.object(functions, "_enforce_lesson_unlocked"),
            patch("app.services.llm.review_project_agent", new_callable=AsyncMock, return_value={
                "score": 65,
                "approved": False,
                "feedback": "Needs proper relational foreign key constraints and error handling.",
                "strengths": ["Clean UI"],
                "improvements": ["Add database transactions"],
                "next_step": "Refactor database migrations",
            })
        ):
            res = asyncio.run(functions.submit_phase_project(
                {
                    "lessonId": self.capstone.id,
                    "submission_text": "Built e-commerce app with SQLite and React",
                    "submission_url": "https://github.com/zeus/ecommerce",
                },
                self.session,
                "student-1",
            ))
            self.assertFalse(res.get("approved"))
            self.session.refresh(self.capstone)
            self.assertEqual(self.capstone.status, "available")
            self.assertFalse(self.capstone.quiz_passed)

        # Test approval when mentor score >= 70
        with (
            patch.object(functions, "_enforce_stage_project_access"),
            patch.object(functions, "_enforce_lesson_unlocked"),
            patch("app.services.llm.review_project_agent", new_callable=AsyncMock, return_value={
                "score": 88,
                "approved": True,
                "feedback": "Excellent architectural separation, responsive UI, and secure API endpoints.",
                "strengths": ["Clean MVC pattern", "JWT authentication"],
                "improvements": ["Add automated E2E tests"],
                "next_step": "Deploy to production",
            })
        ):
            res = asyncio.run(functions.submit_phase_project(
                {
                    "lessonId": self.capstone.id,
                    "submission_text": "Refactored with PostgreSQL and added secure checkout",
                    "submission_url": "https://github.com/zeus/ecommerce-v2",
                },
                self.session,
                "student-1",
            ))
            self.assertTrue(res.get("approved"))
            self.session.refresh(self.capstone)
            self.assertEqual(self.capstone.status, "completed")
            self.assertTrue(self.capstone.quiz_passed)
            self.assertEqual(self.capstone.quiz_score, 88)

    def test_remediation_generation_and_reassessment(self):
        """Generate remediation based on real errors and successfully reassess weakness."""
        # 1. Generate remediation report
        mock_remediation_data = {
            "summary": "The learner demonstrated solid React fundamentals but has misconceptions regarding SQL Indexing structures.",
            "overall_assessment": "Solid intermediate developer ready for targeted database index remediation.",
            "strengths": ["React State Management", "Component Lifecycle"],
            "weaknesses": [
                {
                    "topic": "B-Tree Indexes",
                    "identified_gap": "Understanding how B-Tree index traversal interacts with leading wildcards.",
                    "why_mistake_happened": "Confused index lookup with full table scan predicates.",
                    "evidence_summary": "Incorrect quiz answer in Database Optimization.",
                    "skills_to_improve": ["SQL Indexing"],
                    "revisit_lesson": "Database Optimization",
                    "practice_exercise": "Write an EXPLAIN ANALYZE query showing index scan vs seq scan.",
                    "self_check_criteria": "Verify Index Scan appears in the query plan.",
                }
            ],
            "remediation_plan": [
                {
                    "action": "Review B-Tree structure",
                    "topic": "B-Tree Indexes",
                    "recommendation": "Study how B-Trees organize keys in sorted leaf pages.",
                }
            ],
            "graduation_project_advice": "Ensure PostgreSQL composite indexes match query WHERE clause column order.",
        }

        with patch("app.routers.functions.generate_remediation_agent", new_callable=AsyncMock, return_value=mock_remediation_data):
            res = asyncio.run(functions.generate_remediation_report(
                {"roadmapId": self.roadmap1.id, "lang": "ar"},
                self.session,
                "student-1",
            ))
            self.assertIn("remediation", res)
            remediation_id = res["remediation"]["id"]
            self.assertEqual(res["remediation"]["reassessment_status"], "pending")
            self.assertEqual(len(res["remediation"]["weaknesses"]), 1)

        # 2. Reassess student weakness with passing answer
        with patch("app.routers.functions.reassess_student_weakness_agent", new_callable=AsyncMock, return_value={
            "mastered": True,
            "score": 92,
            "feedback": "Flawless explanation of B-Tree key ordering and SARGable predicates.",
            "new_level": 88,
        }):
            reassess_res = asyncio.run(functions.reassess_student_weakness(
                {
                    "remediationId": remediation_id,
                    "topic": "B-Tree Indexes",
                    "studentResponse": "A B-Tree index requires SARGable predicates. A leading wildcard '%test' prevents index root-to-leaf traversal because keys are sorted from the first character.",
                    "lang": "en",
                },
                self.session,
                "student-1",
            ))
            self.assertTrue(reassess_res["mastered"])
            self.assertEqual(reassess_res["score"], 92)

            # Verify remediation row updated
            remediation = self.session.get(LearningRemediation, remediation_id)
            self.assertEqual(remediation.reassessment_status, "mastered")
            self.assertEqual(remediation.reassessment_score, 92)

            # Verify LearningProfile updated with mastered skill
            self.session.refresh(self.profile)
            skills = {s["skill"]: s["level"] for s in self.profile.skill_graph}
            self.assertGreaterEqual(skills.get("B-Tree Indexes", 0), 80)
            self.assertIn("B-Tree Indexes", self.profile.known_skills)

    # =========================================================================
    # FEATURE 2 TESTS: Continuous Learning & Progressive Roadmaps
    # =========================================================================

    def test_finish_track_gating_and_admin_notifications(self):
        """Track completion requires capstone and notifies all admins."""
        # Attempt completion before capstone is completed -> should fail
        with self.assertRaises(Exception):
            asyncio.run(functions.finish_learning_track(
                {"roadmapId": self.roadmap1.id},
                self.session,
                "student-1",
            ))

        # Pass capstone
        self.capstone.status = "completed"
        self.capstone.quiz_passed = True
        self.capstone.quiz_score = 85
        self.session.add(self.capstone)
        self.session.commit()

        # Complete track
        with patch.object(functions, "_sync_completed_track_outcomes", new_callable=AsyncMock):
            res = asyncio.run(functions.finish_learning_track(
                {"roadmapId": self.roadmap1.id},
                self.session,
                "student-1",
            ))
            self.assertTrue(res.get("completed"))
            self.session.refresh(self.roadmap1)
            self.assertEqual(self.roadmap1.status, "completed")
            self.assertIsNotNone(self.roadmap1.completed_date)

            # Verify admin notification
            notifs = self.session.exec(select(Notification).where(Notification.user_id == "admin-1")).all()
            self.assertTrue(any(n.type == "course_completion" for n in notifs))

    def test_finish_track_requires_recorded_lesson_completion(self):
        """A stale passed flag must not allow an unfinished mandatory lesson through."""
        self.capstone.status = "completed"
        self.capstone.quiz_passed = True
        self.capstone.quiz_score = 85
        self.lesson1.status = "available"
        self.lesson1.quiz_passed = True
        self.session.add_all([self.capstone, self.lesson1])
        self.session.commit()

        with self.assertRaises(Exception):
            asyncio.run(functions.finish_learning_track(
                {"roadmapId": self.roadmap1.id},
                self.session,
                "student-1",
            ))

    def test_progressive_roadmap_chaining_and_idempotency(self):
        """'Continue Learning' generates an advanced roadmap in the same track, linked to parent."""
        # Mark roadmap 1 as completed
        self.roadmap1.status = "completed"
        self.roadmap1.completed_date = datetime.utcnow()
        self.session.add(self.roadmap1)
        self.session.commit()

        mock_advanced_nodes = [
            {"id": "adv_1", "title": "Microservices with gRPC", "skills": ["Microservices", "gRPC"], "phase": 1},
            {"id": "adv_2", "title": "Distributed Caching with Redis", "skills": ["Redis", "Caching"], "phase": 2},
            {"id": "stage_project_final", "title": "Distributed Banking System", "skills": ["System Design"], "phase": 3},
        ]

        with (
            patch("app.routers.functions.research_career_market", new_callable=AsyncMock, return_value={}),
            patch("app.routers.functions.planning_agent", new_callable=AsyncMock, return_value={"nodes": mock_advanced_nodes}),
            patch("app.routers.functions._validate_roadmap_nodes", return_value=[]),
        ):
            # First call generates Roadmap 2
            res1 = asyncio.run(functions.generate_advanced_roadmap(
                {"roadmapId": self.roadmap1.id, "focus": "Advanced Cloud Architecture"},
                self.session,
                "student-1",
            ))
            roadmap2_dict = res1.get("roadmap")
            self.assertIsNotNone(roadmap2_dict)
            self.assertEqual(roadmap2_dict["parent_roadmap_id"], self.roadmap1.id)
            self.assertEqual(roadmap2_dict["sequence_order"], 2)
            self.assertEqual(roadmap2_dict["status"], "active")

            # Second call (idempotency check / double-click) returns existing active track without error
            res2 = asyncio.run(functions.generate_advanced_roadmap(
                {"roadmapId": self.roadmap1.id, "focus": "Advanced Cloud Architecture"},
                self.session,
                "student-1",
            ))
            self.assertEqual(res2["roadmap"]["id"], roadmap2_dict["id"])
            self.assertTrue(res2.get("idempotent"))

    def test_five_consecutive_continuations_keep_an_unbounded_chain(self):
        """Continuations remain meaningful and linked beyond the first follow-on."""
        self.roadmap1.status = "completed"
        self.roadmap1.completed_date = datetime.utcnow()
        self.profile.known_skills = ["HTML", "JavaScript"]
        self.profile.skill_graph = [{"skill": "React", "level": 88}]
        self.session.add_all([self.roadmap1, self.profile])
        self.session.commit()

        generated = []

        async def plan(*args, **kwargs):
            number = len(generated) + 2
            return {"nodes": [
                {"id": f"advanced_{number}", "title": f"Specialization {number}", "skills": [f"Skill {number}"], "phase": 1},
                {"id": "stage_project_final", "title": f"Professional Project {number}", "skills": [f"Project Skill {number}"], "phase": 2},
            ]}

        previous = self.roadmap1
        with (
            patch("app.routers.functions.research_career_market", new_callable=AsyncMock, return_value={}),
            patch("app.routers.functions.planning_agent", side_effect=plan),
            patch("app.routers.functions._validate_roadmap_nodes", return_value=[]),
        ):
            for expected_sequence in range(2, 7):
                response = asyncio.run(functions.generate_advanced_roadmap(
                    {"roadmapId": previous.id, "lang": "en"}, self.session, "student-1"
                ))
                current = self.session.get(Roadmap, response["roadmap"]["id"])
                self.assertEqual(current.parent_roadmap_id, previous.id)
                self.assertEqual(current.sequence_order, expected_sequence)
                self.assertEqual(current.track_name, "Full Stack Web Development")
                generated.append(current)
                current.status = "completed"
                current.completed_date = datetime.utcnow()
                self.session.add(current)
                self.session.commit()
                previous = current

        self.assertEqual(len(generated), 5)
        self.assertEqual(generated[-1].sequence_order, 6)
        self.assertNotEqual(generated[0].nodes[0]["title"], generated[-1].nodes[0]["title"])

    def test_continuation_from_sequence_100_creates_101_with_cumulative_profile(self):
        """A high sequence does not require creating 100 roads and has no cap."""
        high = Roadmap(
            id="roadmap-100", user_id="student-1", goal="Full Stack Web Development",
            track_name="Full Stack Web Development", status="completed", sequence_order=100,
            version=100, completed_date=datetime.utcnow(), nodes=[],
        )
        self.roadmap1.status = "archived"
        self.profile.known_skills = ["HTML", "React", "System Design"]
        self.profile.skill_graph = [{"skill": "Kubernetes", "level": 91}]
        self.session.add_all([high, self.roadmap1, self.profile])
        self.session.commit()
        captured = {}

        async def plan(profile, goal, lang, **kwargs):
            captured["feedback"] = kwargs["validation_feedback"]
            return {"nodes": [
                {"id": "platform", "title": "Platform Engineering", "skills": ["Platform Engineering"], "phase": 1},
                {"id": "stage_project_final", "title": "Principal Capstone", "skills": ["Architecture"], "phase": 2},
            ]}

        with (
            patch("app.routers.functions.research_career_market", new_callable=AsyncMock, return_value={}),
            patch("app.routers.functions.planning_agent", side_effect=plan),
            patch("app.routers.functions._validate_roadmap_nodes", return_value=[]),
        ):
            response = asyncio.run(functions.generate_advanced_roadmap(
                {"roadmapId": high.id, "lang": "en"}, self.session, "student-1"
            ))
        self.assertEqual(response["roadmap"]["sequence_order"], 101)
        self.assertEqual(response["roadmap"]["parent_roadmap_id"], high.id)
        self.assertIn("Kubernetes", captured["feedback"])
        self.assertIn("completed_roadmaps", captured["feedback"])

    def test_admin_completed_courses_endpoint(self):
        """Admin can query all completed courses with student details and filter."""
        self.roadmap1.status = "completed"
        self.roadmap1.completed_date = datetime.utcnow()
        self.capstone.status = "completed"
        self.capstone.quiz_passed = True
        self.capstone.task = {
            "submission_text": "Completed project",
            "review": {"approved": True, "score": 90},
        }
        self.session.add_all([self.roadmap1, self.capstone])
        self.session.commit()

        # Call admin completed-courses endpoint
        data = admin.admin_get_completed_courses(
            track_filter="all",
            search="",
            session=self.session,
            admin=self.admin,
        )
        self.assertGreaterEqual(data["total"], 1)
        course = data["courses"][0]
        self.assertEqual(course["student_name"], "Ahmed Student")
        self.assertEqual(course["student_email"], "student@zeus.local")
        self.assertEqual(course["final_project_status"], "approved")
        self.assertEqual(course["final_project_score"], 90)

    # =========================================================================
    # FEATURE 4 TESTS: Personalized Portfolio Content & Privacy Controls
    # =========================================================================

    def test_portfolio_privacy_controls(self):
        """Public portfolio hides email and phone when configured in portfolio_config."""
        cv = CV(
            id="cv-1",
            user_id="student-1",
            full_name="Ahmed Student",
            email="ahmed@example.com",
            phone="+201012345678",
            portfolio_config={"hide_email": True, "hide_phone": True},
        )
        self.session.add(cv)
        self.session.commit()

        res = asyncio.run(functions.get_public_portfolio(
            {"userId": "student-1"},
            self.session,
            requester_id=None,
        ))
        cv_data = res.get("cv")
        self.assertIsNotNone(cv_data)
        self.assertIsNone(cv_data.get("email"))
        self.assertIsNone(cv_data.get("phone"))
        self.assertEqual(cv_data.get("full_name"), "Ahmed Student")

    def test_portfolio_ai_content_tailoring(self):
        """Portfolio generator customizes emphasis based on track category (Frontend vs Backend vs Data)."""
        mock_content = {
            "track_category": "Full Stack",
            "title_role": "Full Stack Engineer",
            "bio": "Specialized in scalable React applications with robust PostgreSQL architectures.",
            "highlighted_skills": ["React", "FastAPI", "PostgreSQL"],
            "project_descriptions": [
                {
                    "title": "E-Commerce",
                    "enhanced_description": "Architected full stack store with asynchronous payment webhook handling.",
                }
            ],
        }

        with patch("app.routers.functions._call_openai", new_callable=AsyncMock, return_value=mock_content):
            res = asyncio.run(functions.generate_portfolio_content(
                {"track": "Full Stack Web Development", "lang": "en"},
                self.session,
                "student-1",
            ))
            self.assertEqual(res["track_category"], "Full Stack")
            self.assertEqual(res["content"]["title_role"], "Full Stack Engineer")


if __name__ == "__main__":
    unittest.main()
