"""
Pure-LLM Discovery Flow Engine
==================================
Every response is generated in real-time by the Groq LLM (with OpenAI / Gemini
fallback).  Deterministic parsers still run server-side to persist the learner's
profile so that no answer is ever lost — but they NEVER produce visible text.

Architecture:
  1. Deterministic parse  → update persisted profile (silent, no text generated)
  2. LLM call (Groq-first) → real-time conversational reply
  3. On LLM failure (all providers exhausted) → return error dict; frontend shows
     explicit retry button.  No canned/synthetic text is ever injected.
"""

import re
import random

from .llm import (
    _merge_discovery_profile,
    _analyze_missing,
    _discovery_summary,
    _is_question,
    _is_off_topic,
    _needs_question_clarification,
    _detect_lang,
    _has_val,
    _is_empty_val,
    _extract_explicit_discovery_facts,
    _parse_weekly_hours,
    _parse_available_days,
    _parse_enum,
    _user_lines,
    _norm_digits,
    _DAY_ALIASES,
    DIM_ORDER,
    REQUIRED_DIMS,
    RESERVED_KEYS,
    ZEUS_SYSTEM,
    COACH_OPENER_AR,
    COACH_OPENER_EN,
    validate_discovery_answer,
    VALIDATION_GUIDANCE_EXAMPLES,
    discovery_agent,
)

# ---------------------------------------------------------------------------
# Predefined core questions — one per DNA dimension, bilingual
# These are the exact questions the AI "asks" — served instantly, no LLM.
# ---------------------------------------------------------------------------

DISCOVERY_QUESTIONS = {
    "field": {
        "ar": "حابب تتعلم إيه أو هدفك إيه؟ ولو محتار بين مجالات، احكيلي عنها.\nمثلاً: «تحليل البيانات» أو «تطوير الويب» أو «تصميم جرافيك» أو «تسويق رقمي» أو «طبخ احترافي».",
        "en": "What would you like to learn or what's your goal? If you're unsure between fields, tell me.\nExample: 'Data Analysis', 'Web Development', 'Graphic Design', 'Digital Marketing', or 'Professional Cooking'.",
    },
    "field_motivation": {
        "ar": "إيه أكتر حاجة جذبتك للمجال ده؟\nمثلاً: «بحب أبني حاجات مفيدة» أو «نفسي أحل مشكلات حقيقية» أو «بيشوقني اكتشاف المعلومات».",
        "en": "What attracted you most to this field?\nExample: 'I love building useful things', 'I want to solve real problems', or 'I enjoy finding insights in data'.",
    },
    "video_length": {
        "ar": "بتفضل فيديوهات قصيرة ومركزة، ولا شرح طويل ومفصل، ولا مزيج بينهم؟\nمثلاً: «فيديوهات قصيرة» أو «شرح طويل» أو «مزيج».",
        "en": "Do you prefer short focused videos, long detailed explanations, or a mix?\nExample: 'short videos', 'long explanations', or 'a mix'.",
    },
    "purpose": {
        "ar": "عايز تعمل إيه بعد ما تتعلم؟\nمثلاً: «وظيفة كمطور ويب» أو «شغل فريلانس» أو «مشروع خاص» أو «تطوير شغلي الحالي».",
        "en": "What do you want to do after learning?\nExample: 'get a job as a developer', 'freelance', 'build my own project', or 'improve at my current job'.",
    },
    "time_days": {
        "ar": "أنهي أيام من الأسبوع تقدر تذاكر فيها؟\nمثلاً: «السبت والأحد والاتنين» أو «الخميس والجمعة بس».",
        "en": "Which specific days of the week can you study on?\nExample: 'Saturday, Sunday, and Monday' or 'only Thursday and Friday'.",
    },
    "time_hours": {
        "ar": "كام ساعة تقدر تذاكر في كل يوم من الأيام دي؟\nمثلاً: «ساعتين في اليوم» أو «3 ساعات السبت وساعة الأحد».",
        "en": "How many hours can you study on each of those days?\nExample: '2 hours a day' or '3 hours on Saturday and 1 hour on Sunday'.",
    },
    "education": {
        "ar": "تعليمك الحالي إيه؟\nمثلاً: «طالب ثانوي» أو «طالب في كلية هندسة» أو «خريج وشغال» أو «مش بتدرس دلوقتي».",
        "en": "What's your current education?\nExample: 'high school student', 'college student studying Computer Science', 'graduated and working', or 'not studying right now'.",
    },
    "experience": {
        "ar": "عندك خبرة في أي مجال أو مهارات اتعلمتها؟ حتى لو مش مرتبطة بالمجال المختار.\nمثلاً: «اتعلمت شوية Excel وSQLite» أو «عملت مشاريع بـ HTML/CSS» أو «مبتدئ خالص ومعنديش أي خبرة».",
        "en": "Do you have experience in any field or skills you've learned? Even if unrelated to your chosen field.\nExample: 'I know some Excel and basic SQL', 'I've built projects with HTML/CSS', or 'complete beginner with no experience'.",
    },
    "distractions": {
        "ar": "إيه الحاجات اللي بتشتتك وأنت بتذاكر؟\nمثلاً: «إشعارات الموبايل والسوشيال ميديا» أو «الضوضاء حواليا» أو «مفيش حاجة بتشتتني».",
        "en": "What distracts you while studying?\nExample: 'phone notifications and social media', 'noise around me', or 'nothing distracts me'.",
    },
}

# Clickable option chips shown alongside each question (when applicable)
DISCOVERY_OPTIONS = {
    "field": {
        "ar": ["تحليل البيانات", "تطوير الويب", "الذكاء الاصطناعي", "تطوير الموبايل", "تصميم جرافيك", "تسويق رقمي", "الأمن السيبراني"],
        "en": ["Data Analysis", "Web Development", "AI & Machine Learning", "Mobile Development", "Graphic Design", "Digital Marketing", "Cybersecurity"],
    },
    "video_length": {
        "ar": ["فيديوهات قصيرة", "شرح طويل", "مزيج"],
        "en": ["Short videos", "Long explanations", "A mix"],
    },
    "purpose": {
        "ar": ["وظيفة", "عمل حر (فريلانس)", "شغل عن بعد (ريموت)", "تطوير شغلي/دراستي"],
        "en": ["Get a job", "Freelance", "Remote work", "Improve at work/study"],
    },
    "education": {
        "ar": ["مدرسة", "كلية/جامعة", "مش بتدرس دلوقتي"],
        "en": ["School", "College/University", "Not studying right now"],
    },
    "distractions": {
        "ar": ["إشعارات الموبايل", "السوشيال ميديا", "الدوشة", "مفيش حاجة بتشتتني"],
        "en": ["Phone notifications", "Social media", "Noise", "Nothing distracts me"],
    },
}

# ---------------------------------------------------------------------------
# Acknowledgment phrase pools — varied, context-aware, warm (Egyptian Arabic)
# The {placeholder} is filled with the parsed value from the user's answer.
# ---------------------------------------------------------------------------

ACK_OPENERS = {
    "field": {
        "ar": [
            "{goal} — اختيار ممتاز 🔥",
            "كويس جداً! {goal} مجال ليه مستقبل 👍",
            "تمام، {goal} اختيار ذكي 💪",
            "حلو أوي! {goal} مجال مطلوب 🔥",
            "ممتاز! {goal} ده مجال كويس 👌",
        ],
        "en": [
            "{goal} — excellent choice! 🔥",
            "Great pick! {goal} is a solid field 👍",
            "Nice, {goal} has a bright future 💪",
            "Love it! {goal} is in high demand 🔥",
            "Awesome! {goal} is a great path 👌",
        ],
    },
    "field_motivation": {
        "ar": [
            "هدف نبيل 👍",
            "كويس إنك عارف ليه اخترت المجال ده",
            "تمام، الدافع ده هيبقى محفزك 💪",
            "حلو، عارف إيه اللي بيدفعك 👌",
        ],
        "en": [
            "Great motivation 👍",
            "Good to know what drives you",
            "That'll keep you going 💪",
            "Nice, clear purpose 👌",
        ],
    },
    "video_length": {
        "ar": [
            "تمام، هظبط الفيديوهات على ذوقك 👌",
            "كويس، عرفت تفضيلك 👍",
            "حلو، هظبط المحتوى على ده 🔥",
        ],
        "en": [
            "Got it, I'll match the videos to your preference 👌",
            "Noted, thanks! 👍",
            "Nice, I'll tailor the content accordingly 🔥",
        ],
    },
    "purpose": {
        "ar": [
            "هدف واضح 👍",
            "كويس، عارف فين رايح 💪",
            "تمام، ده هيخلينا نركز على الصح 👌",
            "حلو، هدف واضح 🔥",
        ],
        "en": [
            "Clear goal 👍",
            "Good, you know where you're heading 💪",
            "Noted, that'll help me focus the plan 👌",
            "Nice, clear direction 🔥",
        ],
    },
    "time_days": {
        "ar": [
            "تمام، عرفت أيامك 👌",
            "كويس 👍",
            "حلو 🔥",
        ],
        "en": [
            "Got your days 👌",
            "Noted 👍",
            "Nice 🔥",
        ],
    },
    "time_hours": {
        "ar": [
            "تمام، هظبط الجدول على وقتك 👌",
            "كويس، {hours} ساعة أسبوعيًا مناسبة 👍",
            "حلو، وقتك كويس للمذاكرة 💪",
        ],
        "en": [
            "Got it, I'll plan around your schedule 👌",
            "Good, {hours} hours a week works 👍",
            "Nice, that's solid study time 💪",
        ],
    },
    "education": {
        "ar": [
            "تمام 👍",
            "كويس، عرفت 👌",
            "حلو 🔥",
        ],
        "en": [
            "Got it 👍",
            "Noted 👌",
            "Nice 🔥",
        ],
    },
    "experience": {
        "ar": [
            "تمام، هبدأ من مستواك 👌",
            "كويس، مهاراتك دي هتفيدك 💪",
            "حلو، هنعرف نستفيد من خبرتك 👍",
            "ممتاز، هظبط الخطة على خبرتك 🔥",
        ],
        "en": [
            "Got it, I'll start from your level 👌",
            "Good, those skills will help 💪",
            "Nice, we can build on your experience 👍",
            "Great, I'll tailor the plan to your background 🔥",
        ],
    },
    "distractions": {
        "ar": [
            "تمام، هبقى أذكرك تسيب المشتتات 👌",
            "كويس، عرفت اللي بيشتتك 👍",
            "حلو، هنعرف نتعامل مع ده 💪",
        ],
        "en": [
            "Got it, I'll help you manage those 👌",
            "Noted, good to know 👍",
            "Nice, we can work around that 💪",
        ],
    },
}

# Conversational transitions (connect acknowledgment → next question)
TRANSITIONS = {
    "ar": ["طيب، ", "سؤال كويس — ", "خليني أسألك، ", "قوللي، ", "، "],
    "en": ["By the way, ", "So, ", "Quick question — ", "Tell me, ", ", "],
}

# ---------------------------------------------------------------------------
# Broader field recognition — extends _extract_explicit_discovery_facts
# to recognize more career fields beyond just Data Analysis / Web Dev
# ---------------------------------------------------------------------------

FIELD_PATTERNS = [
    # ── Technical / IT ───────────────────────────────────────────────────────
    (r"تحليل\s*(?:ال)?بيانات|داتا\s*أناليس(?:س|يز)|data\s*anal(?:ysis|ytics|yst)", "Data Analysis"),
    (r"(?:تطوير|برمجة)\s*(?:ال)?ويب|web\s*dev(?:elopment)?|full[\s-]*stack|فول\s*ستاك|مطور\s*ويب", "Web Development"),
    (r"الذكاء\s*ال(?:اصطناعي|اصطناعى)|ذكاء\s*اصطناعي|artificial\s*intelligence|\bai\b(?!\w)", "AI & Machine Learning"),
    (r"تعلم\s*(?:ال)?آلة|machine\s*learning|ml\s*engineer", "Machine Learning"),
    (r"الرؤية\s*الحاسوبية|computer\s*vision|رؤية\s*الكومبيوتر", "Computer Vision"),
    (r"معالجة\s*(?:ال)?لغ[ةي]|natural\s*language|nlp|معالجة\s*اللغات", "NLP & Language AI"),
    (r"تطوير\s*(?:تطبيقات?\s*)?(?:ال)?موبايل|mobile\s*(?:app\s*)?dev", "Mobile Development"),
    (r"تطوير\s*(?:تطبيقات?\s*)?(?:سطح\s*المكتب|الكمبيوتر)|desktop\s*(?:app\s*)?dev", "Desktop Development"),
    (r"الأمن\s*(?:السيبراني|الرقني)|cyber\s*security|cybersecurity|info\s*sec", "Cybersecurity"),
    (r"الحوسبة\s*السحابية|cloud\s*comput|cloud\s*eng", "Cloud Computing"),
    (r"dev\s*ops|devops", "DevOps"),
    (r"اختبار\s*(?:ال)?برمجيات|software\s*test|qa\s*test|ضمان\s*الجودة", "Software Testing"),
    (r"علم\s*(?:ال)?بيانات|data\s*science", "Data Science"),
    (r"هندسة\s*(?:ال)?بيانات|data\s*eng(?:ineer)?", "Data Engineering"),
    (r"(?:تصميم|تجربة)\s*(?:المستخدم|الواجهة)|ux|ui\s*design", "UX/UI Design"),
    (r"شبكات|network(?:ing)?|سيسكو|cisco", "Networking"),
    (r"بلوك\s*تشين|blockchain", "Blockchain"),
    (r"أمن\s*المعلومات|information\s*security", "Information Security"),
    (r"هندسة\s*برمجيات|software\s*eng(?:ineer)?", "Software Engineering"),
    # ── Creative & Design ────────────────────────────────────────────────────
    (r"تصميم\s*جرافيك|جرافيك\s*ديزاين|graphic\s*design", "Graphic Design"),
    (r"تصميم\s*(?:ال)?داخلي|interior\s*design|ديكور", "Interior Design"),
    (r"تصوير\s*فوتوغرافي|photography|تصوير\s*احترافي", "Photography"),
    (r"تصوير\s*(?:فيديو|سينمائي)|videography|video\s*production|إنتاج\s*(?:الفيديو|مرئي)", "Video Production"),
    (r"رسم|illustration|تصوير\s*(?:رقمي|إبداعي)|digital\s*art|فن\s*رقمي", "Digital Art & Illustration"),
    (r"تحريك|animation|موشن\s*جرافيك|motion\s*graphics?", "Animation & Motion Graphics"),
    (r"كتابة\s*(?:إبداعية|محتوى)|content\s*writ(?:ing)?|كوبي\s*رايتنج|copywriting", "Content Writing & Copywriting"),
    (r"موسيق[ىي]|عزف|guitar|piano|بيانو|جيتار|music\s*(?:production|theory)?|موسيقى", "Music"),
    # ── Business & Marketing ─────────────────────────────────────────────────
    (r"تسويق\s*(?:رقمي|إلكتروني)|digital\s*market(?:ing)?|سوشيال\s*ميديا\s*ماركتنج", "Digital Marketing"),
    (r"تسويق\s*(?:عام|بالمحتوى)|marketing(?!\s*digital)", "Marketing"),
    (r"إدارة\s*(?:أعمال|المشاريع|الشركات)|business\s*(?:management|admin(?:istration)?)|business\s*development", "Business Management"),
    (r"ريادة\s*(?:الأعمال|أعمال)|entrepreneurship|ستارت\s*آب|startup", "Entrepreneurship"),
    (r"محاسبة|accounting|bookkeeping|مالية|finance(?!\s*tech)", "Accounting & Finance"),
    (r"إدارة\s*المشاريع|project\s*management|بي\s*إم\s*بي|pmp", "Project Management"),
    (r"موارد\s*بشرية|human\s*resources?|hr\b", "Human Resources"),
    (r"مبيعات|sales(?!\s*force)|تجارة", "Sales"),
    (r"تجارة\s*إلكترونية|e[\s-]?commerce|بيع\s*(?:أونلاين|إلكتروني)", "E-Commerce"),
    # ── Languages ────────────────────────────────────────────────────────────
    (r"(?:تعلم\s*)?(?:ال)?لغة\s*الإنجليزية|english\s*(?:language|course|learn)", "English Language"),
    (r"(?:تعلم\s*)?(?:ال)?لغة\s*الفرنسية|french\s*(?:language|course)", "French Language"),
    (r"(?:تعلم\s*)?(?:ال)?لغة\s*الألمانية|german\s*(?:language|course)", "German Language"),
    (r"(?:تعلم\s*)?(?:ال)?لغة\s*الإسبانية|spanish\s*(?:language|course)", "Spanish Language"),
    (r"(?:تعلم\s*)?(?:ال)?لغة\s*الصينية|(?:mandarin|chinese)\s*(?:language|course)", "Chinese / Mandarin"),
    # ── Health & Fitness ─────────────────────────────────────────────────────
    (r"لياقة\s*بدنية|fitness|gym\s*(?:coach|training)?|تدريب\s*(?:رياضي|بدني)", "Fitness & Personal Training"),
    (r"تغذية|nutrition|dietitian|أخصائي\s*تغذية", "Nutrition & Dietetics"),
    (r"يوجا|yoga|تأمل|meditation", "Yoga & Meditation"),
    # ── Culinary & Lifestyle ─────────────────────────────────────────────────
    (r"طبخ|cuisine|cooking|pastry|حلويات|bakin[gk]|مطبخ", "Cooking & Culinary Arts"),
    # ── Skilled Trades & Crafts ──────────────────────────────────────────────
    (r"نجارة|woodwork(?:ing)?|carpentry", "Woodworking & Carpentry"),
    (r"كهرباء|electrical\s*(?:work|engineering|install)|electrician", "Electrical Work"),
    (r"سباكة|plumbing", "Plumbing"),
    (r"خياطة|sewing|tailoring|fashion\s*design", "Fashion Design & Tailoring"),
    # ── Academic ─────────────────────────────────────────────────────────────
    (r"رياضيات|mathematics|math|calculus|algebra", "Mathematics"),
    (r"فيزياء|physics", "Physics"),
    (r"كيمياء|chemistry", "Chemistry"),
    (r"أحياء|biology", "Biology"),
    (r"تاريخ|history", "History"),
    (r"فلسفة|philosophy", "Philosophy"),
    (r"علم\s*(?:ال)?نفس|psychology", "Psychology"),
    (r"اقتصاد|economics", "Economics"),
    (r"قانون|law|legal", "Law"),
]

# Direct option-text → profile field mapping (ensures option clicks always parse)
OPTION_TO_FIELD = {
    "video_length": {
        "فيديوهات قصيرة": ("video_length_preference", "short"),
        "شرح طويل": ("video_length_preference", "long"),
        "مزيج": ("video_length_preference", "mixed"),
        "short videos": ("video_length_preference", "short"),
        "long explanations": ("video_length_preference", "long"),
        "a mix": ("video_length_preference", "mixed"),
    },
    "purpose": {
        "وظيفة": ("career_intent", "employment"),
        "عمل حر (فريلانس)": ("career_intent", "freelancing"),
        "شغل عن بعد (ريموت)": ("career_intent", "remote work"),
        "تطوير شغلي/دراستي": ("career_intent", "improvement"),
        "get a job": ("career_intent", "employment"),
        "freelance": ("career_intent", "freelancing"),
        "remote work": ("career_intent", "remote work"),
        "improve at work/study": ("career_intent", "improvement"),
    },
    "education": {
        "مدرسة": ("education", "school"),
        "كلية/جامعة": ("education", "university"),
        "مش بتدرس دلوقتي": ("education", "not studying"),
        "school": ("education", "school"),
        "college/university": ("education", "university"),
        "not studying right now": ("education", "not studying"),
    },
    "distractions": {
        "إشعارات الموبايل": ("distractions", ["phone notifications"]),
        "السوشيال ميديا": ("distractions", ["social media"]),
        "الدوشة": ("distractions", ["noise"]),
        "مفيش حاجة بتشتتني": ("distractions", ["none"]),
        "phone notifications": ("distractions", ["phone notifications"]),
        "social media": ("distractions", ["social media"]),
        "noise": ("distractions", ["noise"]),
        "nothing distracts me": ("distractions", ["none"]),
    },
}

# Keywords to detect if an assistant message is about a specific dimension
# (used to detect re-asks and prevent the user from getting stuck)
DIM_KEYWORDS = {
    "field": {"ar": ["مجال", "هدف", "تتعلم"], "en": ["field", "goal", "learn"]},
    "video_length": {"ar": ["فيديو", "قصير", "طويل", "مزيج"], "en": ["video", "short", "long", "mix"]},
    "purpose": {"ar": ["تعمل", "وظيفة", "فريلانس", "ريموت", "بعد"], "en": ["job", "freelance", "remote", "after learning"]},
    "time_days": {"ar": ["أيام", "تقدر تذاكر"], "en": ["days", "study on"]},
    "time_hours": {"ar": ["ساعة", "ساعات", "كل يوم"], "en": ["hours", "each day", "per day"]},
    "education": {"ar": ["تعليم", "مدرسة", "كلية", "جامعة"], "en": ["education", "school", "college", "university"]},
    "experience": {"ar": ["خبرة", "مهارات", "تعلمت"], "en": ["experience", "skills", "learned"]},
    "distractions": {"ar": ["تشتت", "تركيز", "موبايل"], "en": ["distract", "focus", "phone"]},
}

# Undecided-field detection markers
UNDECIDED_MARKERS = [
    "محتار", "محتارة", "بين", "ولا", " مش عارف", "مش عارفة", "not sure", "undecided",
    " or ", "بينهم", "مش هعرف", "مش متأكد", "مش متأكدة",
]


def _detect_language(messages, lang_param):
    """Server-side language detection — same logic as discovery_agent."""
    hist = "\n".join(f"{m['role']}: {m['content']}" for m in messages[-15:])
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    all_text = hist + "\n" + (last_user or "")
    explicit_en = bool(re.search(
        r"(رد|تكلم|جاوب)?\s*(بالإنجليزي|بالانجليزي|بالإنجليزية)|english please|speak english|reply in english|in english please",
        all_text.lower(),
    ))
    if explicit_en:
        return "en"
    if re.search(r"[\u0600-\u06FF]", all_text):
        return "ar"
    return _detect_lang(last_user, lang_param if lang_param in ("ar", "en") else "ar")


def _extract_broader_field(text):
    """Recognize any learning goal/field from user input.

    Tries known patterns first (fast-path). For truly novel domains (non-technical,
    creative, culinary, academic, etc.) that aren't in FIELD_PATTERNS, falls back
    to a lightweight free-text extractor that preserves the user's own phrasing.
    """
    text_lower = (text or "").lower().strip()
    if not text_lower:
        return None

    # Fast-path: try all known patterns first
    for pattern, field_name in FIELD_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return field_name

    # Free-text fallback: if the user said something short and clear-sounding,
    # capture it as-is (cleaned up). Avoid capturing filler/question messages.
    if _is_question(text) or _is_off_topic(text):
        return None
    # Must be between 1 and 6 meaningful words and not contain question marks
    words = text.strip().split()
    if not (1 <= len(words) <= 6) or re.search(r"[?؟]", text):
        return None
    # Strip common intro filler ("عايز اتعلم", "I want to learn", etc.)
    _filler = re.compile(
        r"^(?:عايز|عايزة|نفسي|هدفي|بدي|حابب|حابة|أحب|بحب|أريد|اريد|أتعلم|اتعلم|"
        r"تعلم|مجال|I want|I'd like|i love|i'm interested in|want to|"
        r"i want to learn|learn|study|goal is|my goal|i like|interested in)[:\s]*",
        re.IGNORECASE,
    )
    cleaned = _filler.sub("", text.strip()).strip(" .,،؟?!")
    if not cleaned or len(cleaned) < 3:
        return None
    # Reject if it looks like a non-answer ("كل حاجة", "anything", "مش عارف")
    non_answers = re.compile(
        r"^(?:كل\s*حاجة|كلشي|أي\s*حاجة|اي\s*حاجة|أي\s*مجال|اي\s*مجال|anything|everything|"
        r"مش\s*عارف|مش\s*عارفة|not\s*sure|idk|i\s*don'?t\s*know|no\s*idea|"
        r"لا\s*أعرف|لأ|لا)$",
        re.IGNORECASE,
    )
    if non_answers.match(cleaned.strip()):
        return None
    # Capitalise first letter for English phrases; keep Arabic as-is
    if re.search(r"[\u0600-\u06FF]", cleaned):
        return cleaned[:120]
    return cleaned.title()[:120]


def _detect_undecided(text):
    """Check if the user is undecided between multiple fields."""
    text_lower = (text or "").lower().strip()
    if not text_lower:
        return False
    # Must mention at least one field AND an undecided marker
    has_field = _extract_broader_field(text) is not None
    has_undecided = any(marker in text_lower for marker in UNDECIDED_MARKERS)
    # Also check for multiple field mentions (e.g., "data analysis or web development")
    field_count = sum(1 for _, name in FIELD_PATTERNS if re.search(name.split()[0] if name else "", text_lower, re.IGNORECASE))
    return has_undecided or (has_field and field_count >= 2)


def _extract_hours_per_day(text):
    """Extract per-day study hours from text (e.g., 'ساعتين في اليوم' → 2.0).

    Unlike _parse_weekly_hours which returns the weekly total, this returns
    just the per-day amount so we can construct study_hours_by_day.
    """
    t = _norm_digits(text or "").lower()
    if not t:
        return None
    # "ساعتين في اليوم" — dual form means 2 hours/day
    if "ساعتين" in t and any(k in t for k in ["يوم", "day", "daily", "يومي", "كل"]):
        return 2.0
    # "3 ساعات في اليوم" / "2 hours per day" — number + unit + day context
    m = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:ساع\w*|hours?|hrs?)\s*"
        r"(?:في\s*اليوم|يوميا|يومي|a\s*day|daily|per\s*day|كل\s*يوم)",
        t,
    )
    if m:
        return float(m.group(1))
    # "ساعة كل يوم" / "ساعة في اليوم" / "ساعة واحدة" = 1 hour/day
    if re.search(r"(?<!\d\s)(?<!\d)ساعة\b", t) and any(k in t for k in ["يوم", "day", "daily", "كل"]):
        return 1.0
    # Bare number + day context (e.g., "3 في اليوم")
    m2 = re.search(r"(\d+(?:\.\d+)?)\s*(?:في\s*اليوم|يوميا|يومي|a\s*day|daily|per\s*day|كل\s*يوم)", t)
    if m2:
        return float(m2.group(1))
    return None


def _enrich_instant(merged, history, lang, current_dim, last_user):
    """Apply additional deterministic parsing for dimensions that the base
    _merge_discovery_profile doesn't fully cover (education, experience,
    distractions, broader field recognition, option matching)."""
    last_user = (last_user or "").strip()
    last_user_lower = last_user.lower()

    # --- Broader field recognition ---
    if not _has_val(merged, "goal"):
        field = _extract_broader_field(last_user)
        if field:
            merged["goal"] = field

    # --- Option matching: direct text → profile field ---
    # Try exact match and substring match against known option values
    for dim, mapping in OPTION_TO_FIELD.items():
        if dim not in (current_dim, _dim_group(current_dim)):
            continue
        for option_text, (field_key, field_value) in mapping.items():
            if option_text.lower() in last_user_lower or last_user_lower in option_text.lower():
                if isinstance(field_value, list):
                    merged[field_key] = field_value
                else:
                    merged[field_key] = field_value
                break

    # --- Time: construct study_hours_by_day from days + per-day hours ---
    # The base _merge_discovery_profile gets available_days and weekly_hours from
    # the deterministic parsers, but doesn't always build study_hours_by_day
    # (which _analyze_missing requires for the "time" dimension to be complete).
    days = merged.get("available_days")
    if isinstance(days, list) and days and not _has_val(merged, "study_hours_by_day"):
        hpday = _extract_hours_per_day(last_user)
        if hpday is not None and isinstance(hpday, (int, float)) and hpday > 0:
            merged["study_hours_by_day"] = {day: float(hpday) for day in days}
            merged["weekly_hours"] = round(hpday * len(days), 1)

    # --- Education ---
    if not _has_val(merged, "education"):
        if re.search(r"مدرسة|مدرسه", last_user_lower):
            merged["education"] = "school"
        elif re.search(r"كلية|كليه|جامعة|جامعه|بكالوريوس|ماجستير|college|university|bachelor|master", last_user_lower):
            merged["education"] = "university"
        elif re.search(r"مش بتعمل درس|مش بتدرس|مش بدرس|لا أدرس|not studying|not a student|مش طالب", last_user_lower):
            merged["education"] = "not studying"
        elif current_dim == "education" and len(last_user.split()) >= 2 and not _is_question(last_user):
            merged["education"] = last_user[:200]

    # --- Experience ---
    if not _has_val(merged, "experience"):
        # Check for "no experience" / "from zero" / "beginner"
        is_beginner = bool(re.search(
            r"معنديش|من الصفر|من الصغر|مبتدئ|مبتدي|مبتدئة|لا خبرة|مش عندى|مش عندي|no experience|from zero|beginner|just start|starting from scratch|كويس يعني|لسه begun|لسه ببدأ",
            last_user_lower,
        ))
        if is_beginner:
            merged["experience"] = "No prior experience — starting from scratch"
            merged["current_level"] = "beginner"
        elif current_dim == "experience" and not _is_question(last_user) and not _is_off_topic(last_user) and len(last_user.split()) >= 2:
            # The user described their experience — save it
            merged["experience"] = last_user[:500]
            # Extract skill-like tokens (simple heuristic: capitalized words or known skills)
            skill_tokens = re.findall(r"[A-Za-z][A-Za-z+#.]+|[\u0600-\u06FF]{3,}", last_user)
            # Filter out common non-skill words
            stop_words = {"عايز", "عايزة", "عندي", "عندى", "خبرة", "في", "من", "بس", "مش", "كان", "كنت",
                          "have", "with", "some", "experience", "skills", "worked", "used", "know"}
            skills = [s.strip() for s in skill_tokens if s.lower() not in stop_words and len(s) >= 3][:10]
            if skills:
                existing = merged.get("known_skills") or []
                if isinstance(existing, str):
                    existing = [existing]
                merged["known_skills"] = list(dict.fromkeys(existing + skills))[:15]

    # --- Distractions ---
    if not merged.get("distractions"):
        if re.search(r"مفيش حاجة بتشتتني|مفيش تشتت|لا يوجد تشتت|مفيش|ولا حاجة|مشفيه|nothing|none|no distraction|مفيش حاجة", last_user_lower) and any(k in last_user_lower for k in ["تشتت", "يشتت", "بتشتت", "distraction", "خالص", "حاجة", "حاجه", "none"]):
            merged["distractions"] = ["none"]
        elif current_dim == "distractions" and not _is_question(last_user) and not _is_off_topic(last_user) and len(last_user.strip()) >= 2:
            # Save the user's answer as a distraction list
            merged["distractions"] = [last_user[:200]]

    # --- field_motivation: capture what attracted user to the field ---
    if not _has_val(merged, "field_motivation") and current_dim == "field_motivation":
        if not _is_question(last_user) and not _is_off_topic(last_user) and len(last_user.split()) >= 2:
            # Use the answer as the field motivation
            merged["field_motivation"] = last_user[:300]

    # --- Purpose: also try to set motivation from the answer ---
    if not _has_val(merged, "motivation") and current_dim == "purpose":
        if not _is_question(last_user) and not _is_off_topic(last_user) and len(last_user.split()) >= 2:
            # Use the answer as the motivation text
            merged["motivation"] = last_user[:300]

    return merged


def _dim_group(dim):
    """Map sub-dimensions to their group for option matching."""
    if dim in ("time_days", "time_hours"):
        return "time"
    return dim


def _real_weekdays(days):
    """Only keep entries that are actual weekdays (English keys or Arabic names).

    `_parse_available_days` can produce pseudo-entries like "3 days/week" that
    are not individual weekdays; spreading hours across those would be wrong.
    """
    out = []
    for day in days if isinstance(days, list) else []:
        if not isinstance(day, str):
            continue
        d = day.strip().lower()
        for canonical, aliases in _DAY_ALIASES.items():
            if any(alias in d for alias in aliases) and canonical not in out:
                out.append(canonical)
    return out


def _ensure_time_schedule(merged):
    """Prevent the study-time question from being asked forever.

    `_analyze_missing` only clears the "time" dimension once a real
    weekday→hours schedule exists (study_hours_by_day). When the user already
    answered both parts of it — which days AND a study amount — but the answer
    didn't parse into per-day hours, split the stated total evenly across the
    stated weekday(s) instead of re-asking the same question again.
    """
    if _has_val(merged, "study_hours_by_day"):
        return merged
    weekly = merged.get("weekly_hours")
    if not isinstance(weekly, (int, float)) or isinstance(weekly, bool) or weekly <= 0 or weekly > 168:
        return merged
    days = _real_weekdays(merged.get("available_days"))
    if not days:
        return merged
    per_day = round(float(weekly) / len(days), 1)
    if per_day <= 0:
        return merged
    merged["study_hours_by_day"] = {day: per_day for day in days}
    merged["weekly_hours"] = round(per_day * len(days), 1)
    return merged


def _pick_ack(dim, merged, lang):
    """Pick a random, context-aware acknowledgment for the just-covered dimension."""
    pool = ACK_OPENERS.get(dim, {}).get(lang, [])
    if not pool:
        return ""
    template = random.choice(pool)
    try:
        goal = str(merged.get("goal") or "")
        hours = merged.get("weekly_hours")
        if hours is not None:
            hours_text = str(int(hours)) if float(hours).is_integer() else str(hours)
        else:
            hours_text = ""
        return template.format(goal=goal, hours=hours_text)
    except (KeyError, IndexError):
        return template


def _pick_transition(lang):
    """Pick a random conversational transition."""
    return random.choice(TRANSITIONS.get(lang, [", "]))


def _get_question(dim, lang):
    """Get the predefined question text for a dimension."""
    q = DISCOVERY_QUESTIONS.get(dim, {})
    return q.get(lang, q.get("ar", ""))


def _get_options(dim, lang):
    """Get predefined options for a dimension (or None if no options)."""
    opts = DISCOVERY_OPTIONS.get(dim, {})
    options = opts.get(lang, [])
    if len(options) >= 2:
        return list(dict.fromkeys(options))
    return None


def _assistant_asked_about(last_assistant_msg, dim, lang):
    """Check if the last assistant message was about the given dimension."""
    if not last_assistant_msg or not dim:
        return False
    text = last_assistant_msg.lower()
    kws = DIM_KEYWORDS.get(dim, {})
    all_kws = kws.get(lang, []) + kws.get("ar", []) + kws.get("en", [])
    return any(kw.lower() in text for kw in all_kws)


def _is_welcome_message(content):
    """Detect the seeded welcome/greeting message."""
    if not content:
        return False
    c = content.strip()
    return (
        ("ZEUS" in c and ("هالو" in c or "Hello" in c or "أهل" in c))
        or c.startswith(("أهلاً، أنا زيوس", "Hello, I'm ZEUS", "أهلاً، أنا Zeus"))
        or c.startswith(("حابب تتعلم", "What would you like to learn", "حابب تتعلم"))
        or "رفيقك أثناء التعلّم" in c or "learning companion" in c.lower()
    )


def _set_default_for_dim(merged, dim):
    """Set a reasonable default for a dimension the user can't answer."""
    defaults = {
        "video_length_preference": "mixed",
        "education": "not specified",
        "experience": "No prior experience specified",
        "distractions": ["none"],
    }
    if dim == "video_length":
        merged["video_length_preference"] = "mixed"
    elif dim == "education":
        merged["education"] = "not specified"
    elif dim == "experience":
        if not _has_val(merged, "experience") and not _has_val(merged, "known_skills"):
            merged["experience"] = "No prior experience specified"
            if not _has_val(merged, "current_level"):
                merged["current_level"] = "beginner"
    elif dim == "distractions":
        if not merged.get("distractions"):
            merged["distractions"] = ["none"]
    return merged




async def discovery_flow_instant(messages, profile, companion_name, lang, images=None):
    """Pure real-time LLM discovery flow.

    Every visible reply comes from the Groq LLM (with OpenAI / Gemini fallback).
    Deterministic parsers run silently to persist profile data and give the LLM
    the richest possible context — but they NEVER produce visible text.

    Anti-repetition guarantee: the accumulated profile (all already-answered
    dimensions) is always passed to the LLM inside the prompt's ALREADY KNOWN
    block, so the AI never re-asks something the user already answered.

    Returns:
      {reply, options, isComplete, profile, field_comparison?}

    On complete provider failure (all Groq/OpenAI/Gemini slots exhausted):
      {reply: "", error: "connection_error", isComplete: False, profile: merged}
    The frontend must show the explicit retry UI — no synthetic text is injected.
    """
    # ── 1. Build history & detect language ──────────────────────────────────
    hist_full = "\n".join(f"{m['role']}: {m['content']}" for m in messages[-15:])
    hist_before = "\n".join(f"{m['role']}: {m['content']}" for m in messages[-16:-1]) if len(messages) > 1 else ""
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    eff_lang = _detect_language(messages, lang)

    # ── 2. Silent deterministic profile parsing (persistence only) ───────────
    # These parsers accumulate every user answer into the structured profile so:
    #   a) The LLM prompt contains accurate ALREADY KNOWN fields → no re-asking.
    #   b) Server-side profile is always up-to-date regardless of LLM quality.
    merged_before = _merge_discovery_profile(profile, {}, hist_before, eff_lang) if hist_before else dict(profile)
    missing_before = _analyze_missing(merged_before, hist_before)
    current_dim_raw = missing_before[0] if missing_before else None

    merged = _merge_discovery_profile(profile, {}, hist_full, eff_lang)
    merged = _enrich_instant(merged, hist_full, eff_lang, current_dim_raw or "", last_user)
    # Complete the "time" dimension when the user already gave days + a total
    # study amount but no per-day split — otherwise the same question repeats.
    merged = _ensure_time_schedule(merged)

    # ── 3. Route to the real LLM ─────────────────────────────────────────────
    # discovery_agent:
    #   • Builds the full ZEUS_SYSTEM + discovery_prompt with ALREADY KNOWN block
    #   • Instructs the AI to NEVER re-ask settled dimensions
    #   • Handles greetings, small talk, questions, corrections naturally
    #   • Tries all Groq slots then OpenAI then Gemini before giving up
    #   • Returns {reply: "", error: ...} if all providers fail
    result = await discovery_agent(messages, merged, companion_name, eff_lang, images=images)

    # ── 4. Merge deterministic profile into LLM result ───────────────────────
    # The deterministic parse is authoritative for structured fields (hours,
    # days, enums); the LLM is trusted for nuanced free-text fields.
    if isinstance(result.get("profile"), dict):
        result["profile"] = _merge_discovery_profile(merged, result["profile"], hist_full, eff_lang)
    else:
        result["profile"] = merged

    # ── 5. Error signal — no canned text, ever ───────────────────────────────
    if result.get("error") or not (result.get("reply") or "").strip():
        result["reply"] = ""
        # Normalize all LLM failure error codes to "connection_error" so the
        # frontend always sees one consistent signal to show the retry UI.
        result["error"] = "connection_error"
        result["isComplete"] = False
        result.setdefault("profile", merged)
        return result

    return result


def _resolve_question_dim(raw_dim, profile):
    """Map a raw DNA dimension to the specific question key.

    The 'time' dimension splits into two sub-questions:
    - time_days: ask which days (when available_days is missing)
    - time_hours: ask hours per day (when days are known but hours aren't)
    """
    if raw_dim == "time":
        if not _has_val(profile, "available_days"):
            return "time_days"
        if not _has_val(profile, "study_hours_by_day"):
            return "time_hours"
        return "time_hours"  # default
    return raw_dim
