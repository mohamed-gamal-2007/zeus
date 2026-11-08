"""Onboarding intelligence tests (Task 2).

Covers the behavioral fixes to the discovery conversation:
  1. Multi-dimension extraction: ONE user message may answer several pending
     dimensions at once (goal + video preference + schedule + purpose).
  2. Question coverage: dimensions answered in a structured profile are never
     reported as missing again (no repeated questions).
  3. Career-intent parsing: freelancing / employment / own-project markers in
     ANY message fill career_intent deterministically.
  4. Education and experience extraction is message-driven, not gated on the
     currently-asked question.
  5. The anti-repetition guard helper never rejects a fresh question.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.llm import (
    _analyze_missing,
    _merge_discovery_profile,
    _parse_available_days,
    _parse_career_intent,
    _reply_targets_dimension,
)
from app.services.discovery_flow import (
    _enrich_instant,
    _ensure_time_schedule,
    _extract_hours_per_day,
)


def _merge_and_enrich(messages, lang="ar"):
    """Fold a list of user turns into a growing profile, as the live flow does."""
    profile = {}
    history = ""
    for msg in messages:
        history += f"user: {msg}\n"
        profile = _merge_discovery_profile(profile, {}, history, lang)
        profile = _enrich_instant(profile, history, lang, "", msg)
    profile = _ensure_time_schedule(profile)
    return profile, history


class TestMultiDimensionExtraction(unittest.TestCase):
    """Requirement: extract multiple answers from a single message."""

    def test_one_message_answers_goal_video_time_purpose(self):
        last = "عايز أتعلم تحليل بيانات، فيديوهات قصيرة بس، السبت والأحد ساعة كل يوم، ونفسي أشتغل فريلانس"
        profile, history = _merge_and_enrich([last])
        self.assertEqual(profile["goal"], "Data Analysis")
        self.assertEqual(profile["video_length_preference"], "short")
        self.assertEqual(profile["available_days"], ["saturday", "sunday"])
        self.assertEqual(profile["study_hours_by_day"], {"saturday": 1.0, "sunday": 1.0})
        self.assertEqual(profile["weekly_hours"], 2.0)
        self.assertEqual(profile["career_intent"], "freelancing")

    def test_answered_dimensions_not_missing(self):
        last = "عايز أتعلم تحليل بيانات، فيديوهات قصيرة بس، السبت والأحد ساعة كل يوم، ونفسي أشتغل فريلانس"
        profile, history = _merge_and_enrich([last])
        missing = _analyze_missing(profile, history)
        # goal, video, time and purpose were all answered — never missing.
        self.assertNotIn("field", missing)
        self.assertNotIn("video_length", missing)
        self.assertNotIn("time", missing)
        self.assertNotIn("purpose", missing)
        # what is genuinely unknown is still on the list
        self.assertIn("field_motivation", missing)
        self.assertIn("education", missing)
        self.assertIn("distractions", missing)
        self.assertEqual(missing[0], "field_motivation")  # logical order

    def test_goal_and_video_preference_in_one_message(self):
        profile, history = _merge_and_enrich([
            "عايز أتعلم AI، وأحب المشاهدات الطويلة المفصلة",
        ])
        self.assertEqual(profile["goal"], "AI & Machine Learning")
        self.assertEqual(profile["video_length_preference"], "long")
        self.assertNotIn("field", _analyze_missing(profile, history))
        self.assertNotIn("video_length", _analyze_missing(profile, history))


class TestNeverRepeatQuestions(unittest.TestCase):

    def test_video_answered_badly_still_counted(self):
        profile, history = _merge_and_enrich(["مش فارقة المدة بالنسبة لي"])
        self.assertEqual(profile["video_length_preference"], "mixed")
        self.assertNotIn("video_length", _analyze_missing(profile, history))

    def test_time_done_even_split_covered(self):
        profile, history = _merge_and_enrich(["فاضي السبت والأحد", "3 ساعات في اليوم"])
        self.assertEqual(profile["weekly_hours"], 6.0)
        self.assertNotIn("time", _analyze_missing(profile, history))


class TestCareerIntentParsing(unittest.TestCase):

    def test_freelancing(self):
        found = _parse_career_intent("user: نفسي أشتغل فريلانس")
        self.assertEqual(found["career_intent"], "freelancing")

    def test_employment(self):
        found = _parse_career_intent("user: عايز اتوظف في شركة")
        self.assertEqual(found["career_intent"], "employment")

    def test_own_project(self):
        found = _parse_career_intent("user: نفسني أبني مشروع خاص")
        self.assertEqual(found["career_intent"], "own project")

    def test_call_in_merge(self):
        profile, _ = _merge_and_enrich(["عايز أشتغل عمل حر"])
        self.assertEqual(profile["career_intent"], "freelancing")


class TestMessageDrivenExtraction(unittest.TestCase):

    def test_education_from_any_message(self):
        profile, history = _merge_and_enrich(["أنا عندي بكالوريوس هندسة"])
        self.assertEqual(profile["education"], "university")
        self.assertNotIn("education", _analyze_missing(profile, history))

    def test_not_studying_from_any_message(self):
        profile, history = _merge_and_enrich(["أنا مش بتدرس دلوقتي"])
        self.assertEqual(profile["education"], "not studying")
        self.assertNotIn("education", _analyze_missing(profile, history))

    def test_beginner_experience_from_any_message(self):
        profile, history = _merge_and_enrich(["معنديش خبرة أبداً"])
        self.assertEqual(profile["current_level"], "beginner")
        self.assertEqual(profile["experience"], "No prior experience — starting from scratch")

    def test_no_distractions(self):
        profile, history = _merge_and_enrich(["مفيش حاجة بتشتتني خالص"])
        self.assertEqual(profile["distractions"], ["none"])
        self.assertNotIn("distractions", _analyze_missing(profile, history))


class TestDayAndHoursParsers(unittest.TestCase):

    def test_named_days_beat_every_day(self):
        # «السبت والأحد ساعة كل يوم» = two named days, not a 7-day week.
        found = _parse_available_days("user: السبت والأحد ساعة كل يوم")
        self.assertEqual(found, ["saturday", "sunday"])

    def test_every_day_still_works(self):
        found = _parse_available_days("user: كل الأيام فاضية عندي")
        self.assertEqual(len(found), 7)

    def test_bare_sa3a_means_one_hour(self):
        self.assertEqual(_extract_hours_per_day("ساعة كل يوم"), 1.0)

    def test_two_hours_a_day(self):
        self.assertEqual(_extract_hours_per_day("3 ساعات في اليوم"), 3.0)
        self.assertEqual(_extract_hours_per_day("ساعتين في اليوم"), 2.0)


class TestAntiRepetitionGuard(unittest.TestCase):

    def test_video_question_detected(self):
        self.assertEqual(
            _reply_targets_dimension("تمام! بتحب تشوف فيديوهات قصيرة ولا شرح طويل مفصل؟"),
            "video_length",
        )

    def test_education_question_detected(self):
        self.assertEqual(
            _reply_targets_dimension("رائع. تعليمك لم وصل فين — مدرسة ولا كلية؟"),
            "education",
        )

    def test_acknowledgment_without_question_not_flagged(self):
        self.assertIsNone(_reply_targets_dimension("جميل جدًا، هنظبط الجدول على الشكل ده 👌"))

    def test_questionless_reply_not_flagged(self):
        self.assertIsNone(_reply_targets_dimension("جميل جدًا، هنظبط الجدول على الشكل ده 👌"))
        self.assertIsNone(_reply_targets_dimension("تسلم، كلامك وصل"))


if __name__ == "__main__":
    unittest.main()
