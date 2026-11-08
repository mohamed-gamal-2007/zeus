"""Task-2 live E2E: onboarding intelligence, comparison cards, recovery,
no-repeat questions, DNA data completeness. Runs INSIDE the zeus_app container."""
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core.database import engine
from app.core.security import create_access_token, hash_password
from app.models import AIRequest, Conversation, LearningProfile, User

BASE = "http://localhost:8000/api"
EMAIL = "e2e-t2@zeusedu.tech"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    line = ("PASS " if ok else "FAIL ") + name
    if not ok:
        line += " :: " + str(detail)[:240]
    print(line, flush=True)


def req(method, path, token, body=None, timeout=140):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_http": e.code}


def ai_rows(rid):
    with Session(engine) as s:
        rows = s.exec(select(AIRequest).where(AIRequest.request_id == rid)).all()
        return [(r.status, bool(r.result)) for r in rows]


# -- bootstrap user -----------------------------------------------------------
with Session(engine) as s:
    u = s.exec(select(User).where(User.email == EMAIL)).first()
    if not u:
        u = User(email=EMAIL, password_hash=hash_password("E2eT2!pass99"), full_name="E2E T2",
                 role="user", status="active")
        s.add(u)
    u.subscription_status = "active"
    u.subscription_plan = "pro"
    u.subscription_expires = datetime.utcnow() + timedelta(days=365)
    s.add(u)
    s.commit()
    s.refresh(u)
    uid = u.id
TOKEN = create_access_token(uid)
print("user ready:", uid, flush=True)

WELCOME = "أهلاً بيك! أنا زيوس، رفيك في رحلة التعلم. بتحب تتعلم إيه؟"


def turn(history, profile, text, rid):
    body = {"messages": history + [{"role": "user", "content": text}],
            "profile": profile, "companionName": "Zeus", "lang": "ar", "request_id": rid}
    return req("POST", "/functions/discoveryChat", TOKEN, body)


hist = [{"role": "assistant", "content": WELCOME}]
prof = {}
rids = ["t2-a1", "t2-a2", "t2-a3", "t2-a4", "t2-a5", "t2-a6", "t2-a7", "t2-a8"]

r1 = turn(hist, prof, "عايز أتعلم الذكاء الاصطناعي", rids[0])
hist += [{"role": "user", "content": "عايز أتعلم الذكاء الاصطناعي"},
         {"role": "assistant", "content": r1.get("reply", "")}]
prof = {**prof, **(r1.get("profile") or {})}
check("A1 goal captured", prof.get("goal") == "AI & Machine Learning", (r1.get("reply"), prof.get("goal")))
check("A1 no duplicate token rows", len(ai_rows(rids[0])) == 1, ai_rows(rids[0]))

q1 = r1.get("reply") or ""
check("A1 does NOT re-ask video/time/education", not any(k in q1 for k in ["قصير ولا", "طويل ولا", "كام ساع", "أنهي أيام", "تعليمك", "مدرسة ولا"]), q1[:120])

mot_text = "بحب إن البر يفهم كيف الأنظمة تتعلم بنفسها"
r2 = turn(hist, prof, mot_text, rids[1])
hist += [{"role": "user", "content": mot_text}, {"role": "assistant", "content": r2.get("reply", "")}]
prof2 = {**prof, **(r2.get("profile") or {})}
q2 = r2.get("reply") or ""
check("A2 field_motivation captured", bool(prof2.get("field_motivation")), prof2.get("field_motivation"))
check("A2 next logical dim (video/purpose/time)", any(k in q2 for k in ["فيدي", "قصير", "طويل", "بعد ما تعلم", "بعد ما تتعلم", "عايز تعمل", "ساع", "أيام", "ايام"]) or not q2, q2[:120])

r3 = turn(hist, prof2, "فيديوهات قصيرة اختصرها", rids[2])
hist += [{"role": "user", "content": "فيديوهات قصيرة اختصرها"},
         {"role": "assistant", "content": r3.get("reply", "")}]
prof3 = {**prof2, **(r3.get("profile") or {})}
q3 = r3.get("reply") or ""
check("A3 video captured, not re-asked", prof3.get("video_length_preference") == "short" and "قصير ولا" not in q3, (prof3.get("video_length_preference"), q3[:110]))

r4 = turn(hist, prof3, "عايز أشتغل فريلانس مستقل", rids[3])
hist += [{"role": "user", "content": "عايز أشتغل فريلانس مستقل"},
         {"role": "assistant", "content": r4.get("reply", "")}]
prof4 = {**prof3, **(r4.get("profile") or {})}
q4 = r4.get("reply") or ""
check("A4 purpose (career_intent) captured", prof4.get("career_intent") == "freelancing", prof4.get("career_intent"))
check("A4 next is time", any(k in q4 for k in ["ساع", "أيام", "ايام", "جدول"]), q4[:110])

r5 = turn(hist, prof4, "السبت والأحد ساعة كل يوم", rids[4])
hist += [{"role": "user", "content": "السبت والأحد ساعة كل يوم"},
         {"role": "assistant", "content": r5.get("reply", "")}]
prof5 = {**prof4, **(r5.get("profile") or {})}
q5 = r5.get("reply") or ""
check("A5 schedule captured", prof5.get("available_days") == ["saturday", "sunday"] and prof5.get("weekly_hours") == 2.0, (prof5.get("available_days"), prof5.get("weekly_hours")))
check("A5 next is education", any(k in q5 for k in ["تعليم", "كلية", "مدرسة", "بدرس", "جدرس"]) or not q5, q5[:110])

r6 = turn(hist, prof5, "أنا خلصت بكالوريوس حاسبات", rids[5])
hist += [{"role": "user", "content": "أنا خلصت بكالوريوس حاسبات"},
         {"role": "assistant", "content": r6.get("reply", "")}]
prof6 = {**prof5, **(r6.get("profile") or {})}
q6 = r6.get("reply") or ""
check("A6 education captured", str(prof6.get("education")) == "university", prof6.get("education"))
check("A6 next is experience", any(k in q6 for k in ["خبرة", "مهارات", "شغلت", "جربت"]), q6[:110])

r7 = turn(hist, prof6, "معنديش خبرة أبداً، من الصفر", rids[6])
hist += [{"role": "user", "content": "معنديش خبرة أبداً، من الصفر"},
         {"role": "assistant", "content": r7.get("reply", "")}]
prof7 = {**prof6, **(r7.get("profile") or {})}
q7 = r7.get("reply") or ""
check("A7 experience/beginner captured", prof7.get("current_level") == "beginner", prof7.get("current_level"))
check("A7 next is distractions", any(k in q7 for k in ["تشتي", "تشتت", "تركيز", "إشعارات", "مشتتات"]), q7[:110])

r8 = turn(hist, prof7, "مفيش حاجة بتشتتني خالص", rids[7])
hist += [{"role": "user", "content": "مفيش حاجة بتشتتني خالص"},
         {"role": "assistant", "content": r8.get("reply", "")}]
prof8 = {**prof7, **(r8.get("profile") or {})}
check("A8 distractions captured", prof8.get("distractions") == ["none"], prof8.get("distractions"))
check("A8 conversation complete", r8.get("isComplete") is True, (r8.get("isComplete"), (r8.get("reply") or "")[:80]))
dims = ["goal", "field_motivation", "video_length_preference", "career_intent",
        "available_days", "weekly_hours", "education", "experience", "distractions", "current_level"]
missing_dims = [d for d in dims if not prof8.get(d)]
check("A8/DNA profile complete (all dims)", not missing_dims, missing_dims)

# -- Scenario 2/3/4: ONE message answers multiple dims; nothing re-asked -------
rid_b = "t2-b1"
rb = turn([{"role": "assistant", "content": WELCOME}], {},
          "عايز أتعلم تحليل بيانات، فيديوهات قصيرة بس، السبت والأحد ساعة كل يوم، ونفسي أشتغل فريلانس", rid_b)
pb = rb.get("profile") or {}
check("B1 multi-dim: goal", pb.get("goal") == "Data Analysis", pb.get("goal"))
check("B1 multi-dim: video", pb.get("video_length_preference") == "short", pb.get("video_length_preference"))
check("B1 multi-dim: days/hours", pb.get("available_days") == ["saturday", "sunday"] and (pb.get("weekly_hours") or 0) >= 1, (pb.get("available_days"), pb.get("weekly_hours")))
check("B1 multi-dim: purpose", pb.get("career_intent") == "freelancing", pb.get("career_intent"))
qb = rb.get("reply") or ""
check("B1 reply does NOT re-ask answered dims", not any(k in qb for k in ["قصير ولا", "كام ساع", "أنهي أيام", "فريلانس"]), qb[:140])

# -- Scenario 5: undecided user receives comparison cards ----------------------
rid_c = "t2-c1"
rc = turn([{"role": "assistant", "content": WELCOME}], {},
          "محتار أوي بين الذكاء الاصطناعي وتطوير الويب وعلم البيانات، مش عارف أختار إيه نهائياً", rid_c)
cmp_ = rc.get("field_comparison") or []
check("C undecided gets comparison cards (>=2)", len(cmp_) >= 2, [c.get("field") for c in cmp_])
check("C cards have descriptions", len(cmp_) >= 2 and all(c.get("description") for c in cmp_), (cmp_ or [{}])[:1])
check("C reply invites a choice", any(k in (rc.get("reply") or "") for k in ["أقرب", "اقرب", "حاسس", "اختار", "تحب", "مساعدتك"]), (rc.get("reply") or "")[:120])

# -- Scenario 7: field change --------------------------------------------------
rid_d = "t2-d1"
rd = turn([{"role": "assistant", "content": WELCOME}],
          {"goal": "AI & Machine Learning", "preferred_language": "ar"},
          "لأ غيرت رأيي، عايز أتعلم تطوير الويب مش الذكاء الاصطناعي", rid_d)
pd_ = rd.get("profile") or {}
check("D field change to Web Development", pd_.get("goal") == "Web Development", pd_.get("goal"))

# -- Scenario 8/9/10: slow response recoverable, 1 token, identical replay ------
uid2_email = "e2e-t2-b@zeusedu.tech"
with Session(engine) as s:
    u2 = s.exec(select(User).where(User.email == uid2_email)).first()
    if not u2:
        u2 = User(email=uid2_email, password_hash=hash_password("E2eT2!pass99"), full_name="E2E T2 B", role="user", status="active")
        s.add(u2)
    u2.subscription_status = "active"
    u2.subscription_plan = "pro"
    u2.subscription_expires = datetime.utcnow() + timedelta(days=365)
    s.add(u2)
    s.commit()
    s.refresh(u2)
    uid2 = u2.id
TOKEN2 = create_access_token(uid2)

rid_e = "t2-e1-" + datetime.utcnow().strftime("%H%M%S")
body_e = {"messages": [{"role": "assistant", "content": WELCOME},
                       {"role": "user", "content": "عندي فكرة اتعلم علم البيانات وخصوصاً تحليل البيانات"}],
          "profile": {}, "companionName": "Zeus", "lang": "ar", "request_id": rid_e}
holder = {}


def slow_call():
    holder["res"] = req("POST", "/functions/discoveryChat", TOKEN2, body_e)


th = threading.Thread(target=slow_call, daemon=True)
th.start()
time.sleep(3.0)  # in-flight; the user would refresh "now"
rec = req("GET", "/functions/discoveryResult/" + rid_e, TOKEN2)
check("E request recoverable server-side while processing", ("pending" in rec) or bool(rec.get("reply")), {"code": rec.get("_http"), "keys": list(rec)[:6]})
th.join(timeout=140)
direct = holder.get("res") or {}
time.sleep(1.0)
replay = req("POST", "/functions/discoveryChat", TOKEN2, body_e)
rows_e = ai_rows(rid_e)
check("E exactly ONE ai_request row", len(rows_e) == 1, rows_e)
check("E replay identical to original", bool(direct.get("reply")) and (replay.get("reply") or "") == (direct.get("reply") or ""), {"direct_len": len((direct.get("reply") or "")), "replay_len": len((replay.get("reply") or ""))})
check("E replay flagged replayed or same content", bool(direct.get("reply")) and (replay.get("replayed") is True or replay.get("reply") == direct.get("reply")), replay.get("replayed"))

print("\n==== SUMMARY ====", flush=True)
fails = [name for name, ok, _ in results if not ok]
print("TOTAL: %d  PASS: %d  FAIL: %d" % (len(results), len(results) - len(fails), len(fails)), flush=True)
if fails:
    print("failed:", fails, flush=True)
sys.exit(1 if fails else 0)
