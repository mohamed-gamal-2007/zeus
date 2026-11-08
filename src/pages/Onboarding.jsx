import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Map, Target, Gauge, ArrowLeft, ArrowRight, Check, Loader2, GitCompare, BookOpen } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import Logo from "@/components/zeus/Logo";
import LanguageToggle from "@/components/zeus/LanguageToggle";
import ThemeToggle from "@/components/zeus/ThemeToggle";
import ChatPanel from "@/components/zeus/ChatPanel";
import DnaSummary from "@/components/zeus/onboarding/DnaSummary";
import CareerFieldExplorer from "@/components/zeus/onboarding/CareerFieldExplorer";
import { findCareerField } from "@/data/careerFields";
import RoadmapReveal from "@/components/zeus/onboarding/RoadmapReveal";
import { toast } from "@/components/ui/use-toast";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";
import { logApi, classifyError, responseQuality } from "@/lib/devlog";

const STEPS = [
  { key: "discovery", icon: Brain, labelKey: "onb.discover.title" },
  { key: "dna", icon: Brain, labelKey: "onb.dna.title" },
  { key: "goal", icon: Target, labelKey: "onb.goal.title" },
  { key: "assessment", icon: Gauge, labelKey: "onb.assess.title" },
  { key: "roadmap", icon: Map, labelKey: "onb.roadmap.title" }
];

const welcomeMessage = (isAr) =>
  isAr
    ? "أهلاً، أنا ZEUS ورفيقك أثناء التعلّم ☺️ حابب تتعلم إيه أو هدفك إيه؟ ولو محتار بين مجالات أو عندك مشكلة أو حاجة واقفة معاك، احكيلي عنها."
    : "Hi, I'm ZEUS, your learning companion ☺️ What would you like to learn or achieve? If you're unsure between fields, facing a problem, or feeling stuck, tell me about it.";

export default function Onboarding() {
  const { t, lang, dir } = useI18n();
  const { user } = useAuth();
  const { profile, loading, createProfile, updateProfile } = useProfile();
  const nav = useNavigate();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [step, setStep] = useState("discovery");
  const [companionName] = useState("Zeus");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatConnectionError, setChatConnectionError] = useState(false); // hard error: retry UI
  const [pendingRetryMsg, setPendingRetryMsg] = useState(null); // {text, profilePatch, images}
  const [recs, setRecs] = useState(null);
  const [keySkills, setKeySkills] = useState([]);
  const [skillLevels, setSkillLevels] = useState({});
  const [roadmapPreview, setRoadmapPreview] = useState(null);
  const [skillsText, setSkillsText] = useState("");
  const [fieldComparison, setFieldComparison] = useState(null);
  const [chatOptions, setChatOptions] = useState(null);
  const [fieldGuideSource, setFieldGuideSource] = useState("");
  const [fieldGuideQuery, setFieldGuideQuery] = useState("");
  const [fieldGuideSelectedId, setFieldGuideSelectedId] = useState("");
  const [building, setBuilding] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [partnerContext, setPartnerContext] = useState(null);
  const [partnerContextLoading, setPartnerContextLoading] = useState(user?.role === "partner_student");
  const [partnerContextError, setPartnerContextError] = useState("");

  useEffect(() => {
    if (user?.role !== "partner_student") {
      setPartnerContext(null);
      setPartnerContextLoading(false);
      return undefined;
    }
    let active = true;
    setPartnerContextLoading(true);
    setPartnerContextError("");
    api.partners.studentLearningContext()
      .then((context) => {
        if (!active) return;
        setPartnerContext(context);
        if (!context.ready) {
          setPartnerContextError(isAr
            ? "الدكتور لسه ماحددش المسار والمهارات. اطلب منه يكمل إعدادهم قبل ما تبدأ."
            : "Your instructor has not set the learning path and skills yet. Ask them to finish setup before you begin.");
        }
      })
      .catch((contextError) => {
        if (active) {
          setPartnerContextError(contextError.message || (isAr ? "تعذر تحميل إعدادات التعلم." : "Could not load learning setup."));
        }
      })
      .finally(() => { if (active) setPartnerContextLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.role, isAr]);

  const partnerWelcomeMessage = (context) => (
    isAr
      ? `أهلاً، أنا ZEUS. الدكتور حدد لك مسار ${context.track}. هسألك الأول عن الوقت المناسب للمذاكرة، وبعدها عن خبرتك والمهارات اللي تعرفها عشان أظبط الخريطة على مستواك.`
      : `Hi, I'm ZEUS. Your instructor assigned you to ${context.track}. I'll ask about your study time, then your experience and existing skills, so I can tailor your roadmap to your level.`
  );

  // The companion is always Zeus — no naming step. First visit auto-creates
  // the profile and starts the discovery chat immediately.
  const startedRef = React.useRef(false);
  const initializedConversationProfileRef = React.useRef(null);
  const loadingConversationProfileRef = React.useRef(null);
  useEffect(() => {
    if (loading || partnerContextLoading) return;
    const usesPartnerIntake = user?.role === "partner_student"
      && partnerContext?.ready
      && partnerContext.learning_mode !== "student_discovery";
    if (user?.role === "partner_student" && partnerContext && !partnerContext.ready) return;
    if (usesPartnerIntake && partnerContext.has_roadmap) {
      nav("/app", { replace: true });
      return;
    }
    // Fresh account: create profile + first conversation in one go
    if (!profile) {
      (async () => {
        if (startedRef.current) return;
        startedRef.current = true;
        try {
          const assignedSkills = partnerContext?.skills || [];
          const p = await createProfile({
            companion_name: "Zeus",
            ...(usesPartnerIntake ? {
              goal: partnerContext.track,
              target_skills: assignedSkills,
              current_level: "beginner",
              known_skills: [],
              onboarding_step: "partner_intake",
            } : { onboarding_step: "discovery" }),
          });
          if (!p) throw new Error("profile");
          loadingConversationProfileRef.current = p.id;
          const initialMessage = usesPartnerIntake
            ? partnerWelcomeMessage(partnerContext)
            : welcomeMessage(isAr);
          const convo = await api.entities.Conversation.create({
            type: usesPartnerIntake ? "partner_intake" : "discovery",
            companion_name: "Zeus",
            messages: [{ role: "assistant", content: initialMessage, ts: new Date().toISOString() }]
          });
          initializedConversationProfileRef.current = p.id;
          setConversation(convo);
          setMessages(convo.messages || []);
          if (usesPartnerIntake) setKeySkills(assignedSkills);
          setStep(usesPartnerIntake ? "partner_intake" : "discovery");
        } catch {
          // Never leave a blank screen: surface the failure with a retry.
          startedRef.current = false;
          loadingConversationProfileRef.current = null;
          setBootError(true);
        } finally {
          loadingConversationProfileRef.current = null;
        }
      })();
      return;
    }
    if (profile.onboarding_step === "done") { nav("/app", { replace: true }); return; }
    if (usesPartnerIntake && !partnerContext.has_roadmap) {
      const assignedSkills = partnerContext.skills || [];
      setStep("partner_intake");
      setKeySkills(assignedSkills);
      if (
        profile.onboarding_step !== "partner_intake"
        || profile.goal !== partnerContext.track
        || JSON.stringify(profile.target_skills || []) !== JSON.stringify(assignedSkills)
      ) {
        updateProfile({
          goal: partnerContext.track,
          target_skills: assignedSkills,
          current_level: profile.current_level || "beginner",
          onboarding_step: "partner_intake",
        }).catch((error) => {
          console.error("Failed to prepare instructor-guided learning:", error);
          setPartnerContextError(isAr
            ? "تعذر تحميل إعدادات مسارك. حدّث الصفحة أو تواصل مع الدكتور."
            : "Could not prepare your assigned learning path. Refresh or contact your instructor.");
        });
      }
      if (initializedConversationProfileRef.current !== profile.id
        && loadingConversationProfileRef.current !== profile.id) {
        loadingConversationProfileRef.current = profile.id;
        (async () => {
          try {
            const existing = await api.entities.Conversation.filter({ type: "partner_intake" }, "-created_date", 1);
            const convo = existing[0] || await api.entities.Conversation.create({
              type: "partner_intake",
              companion_name: "Zeus",
              messages: [{
                role: "assistant",
                content: partnerWelcomeMessage(partnerContext),
                ts: new Date().toISOString(),
              }],
            });
            initializedConversationProfileRef.current = profile.id;
            setConversation(convo);
            setMessages(convo.messages || []);
            setBootError(false);
          } catch (error) {
            console.error("Failed to initialize instructor-guided conversation:", error);
            setBootError(true);
          } finally {
            loadingConversationProfileRef.current = null;
          }
        })();
      }
      return;
    }
    // Legacy "naming" step or custom names migrate to fixed "Zeus"
    let s = profile.onboarding_step || "discovery";
    if (s === "naming") s = "discovery";
    setStep(s);
    setBootError(false);
    if (profile.companion_name !== "Zeus") {
      updateProfile({ companion_name: "Zeus" }).catch(() => {});
    }
    if (s === "discovery" && initializedConversationProfileRef.current !== profile.id
      && loadingConversationProfileRef.current !== profile.id) {
      loadingConversationProfileRef.current = profile.id;
      (async () => {
        try {
          const existing = await api.entities.Conversation.filter({ type: "discovery" }, "-created_date", 1);
          const convo = existing[0] || await api.entities.Conversation.create({
            type: "discovery", companion_name: "Zeus",
            messages: [{ role: "assistant", content: welcomeMessage(isAr), ts: new Date().toISOString() }]
          });
          initializedConversationProfileRef.current = profile.id;
          setConversation(convo);
          setMessages(convo.messages || []);
          setBootError(false);
        } catch (error) {
          console.error("Failed to initialize discovery conversation:", error);
          setBootError(true);
        } finally {
          loadingConversationProfileRef.current = null;
        }
      })();
    }
  }, [profile?.id, profile?.onboarding_step, profile?.goal, profile?.target_skills, loading, partnerContextLoading, partnerContext, user?.id, user?.role, nav, isAr]);

  const goto = async (nextStep, patch = {}) => {
    // Do not advance over an unsaved answer. Otherwise refresh/resume starts
    // the learner at a later step with missing profile data.
    try {
      if (profile) await updateProfile({ onboarding_step: nextStep, ...patch });
      setStep(nextStep);
    } catch (error) {
      console.error(`Failed to save onboarding step "${nextStep}":`, error);
      toast({
        title: isAr ? "تعذر حفظ إجاباتك" : "Could not save your answers",
        description: isAr ? "لم ننتقل للخطوة التالية حتى لا تضيع إجاباتك. حاول مجددًا." : "We kept you on this step so your answers are not lost. Please retry.",
        variant: "destructive",
      });
    }
  };

  // ---------- Discovery (interactive choices, no repeat, auto-advance) ----------
  const inFlightRef = React.useRef(false);
  // Refs mirror the latest state so async callbacks never read stale closures.
  const profileRef = React.useRef(profile);
  profileRef.current = profile;
  const conversationRef = React.useRef(conversation);
  conversationRef.current = conversation;
  // Queue of messages that arrived while a previous request was still in
  // flight — an array so rapid multi-clicks never silently drop answers.
  const pendingQueueRef = React.useRef([]);
  // Idempotency: ONE request id per logical answer. Every retry reuses the
  // same id so the backend replays its stored response instead of spending
  // another LLM call. Cleared only after a turn fully succeeded.
  const activeRequestIdRef = React.useRef(null);
  const [recovering, setRecovering] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  useEffect(() => {
    if (!savedRecently) return undefined;
    const timer = setTimeout(() => setSavedRecently(false), 3000);
    return () => clearTimeout(timer);
  }, [savedRecently]);

  // Reserved LearningProfile keys that must never be written from AI output.
  const RESERVED_PROFILE_KEYS = React.useMemo(
    () => new Set(["id", "user_id", "onboarding_step", "status", "created_date", "updated_date"]),
    []
  );
  const cleanProfilePatch = (patch) => Object.fromEntries(
    Object.entries(patch || {}).filter(
      ([k, v]) => !RESERVED_PROFILE_KEYS.has(k) && v !== null && v !== undefined && v !== ""
        && !(Array.isArray(v) && v.length === 0)
    )
  );

  // Safe conversation update — never crashes on null conversation (init may still be in flight).
  const safeUpdateConversation = async (msgs) => {
    const convo = conversationRef.current;
    if (!convo?.id) return;
    try {
      await api.entities.Conversation.update(convo.id, { messages: msgs });
      logApi("conversation.persisted", { endpoint: `PUT /api/entities/Conversation/${convo.id}`, db: "saved" });
    } catch (error) {
      const { kind, phase } = classifyError(error);
      logApi("conversation.persist_failed", { endpoint: `PUT /api/entities/Conversation/${convo.id}`, db: "save_failed", phase, kind });
    }
  };

  const persistDiscoveryProfile = async (patch, requestId = "") => {
    if (!patch || typeof patch !== "object") return;
    try {
      const inc = cleanProfilePatch(patch);
      if (Object.keys(inc).length) {
        await updateProfile(inc);
        logApi("profile.persisted", { requestId, db: "saved", fields: Object.keys(inc).length });
      }
    } catch (error) {
      const { kind, phase } = classifyError(error);
      // Non-fatal: the server persists the same fields itself.
      logApi("profile.persist_failed", { requestId, db: "save_failed", phase, kind });
    }
  };

  /**
   * Response recovery: poll the backend's stored result for this exact
   * request id. The stored response is replayed verbatim WITHOUT a new LLM
   * call, so recovery never consumes additional tokens. Returns the recovered
   * response, or null when the turn genuinely produced nothing.
   *
   * The window must exceed the worst-case server compute time (~80s agent
   * budget) measured from the moment THIS client noticed the fetch was lost,
   * so a slow-but-succeeding model never degrades into a manual Retry.
   */
  const recoverDiscoveryResult = async (requestId, { attempts = 34, delayMs = 3200 } = {}) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const raw = await api.functions.result(requestId);
        const data = raw?.data || raw || {};
        if (data.pending) {
          logApi("discovery.recovery", { requestId, attempt: attempt + 1, outcome: "still_processing" });
          continue;
        }
        if (data.error === "connection_error") {
          logApi("discovery.recovery", { requestId, attempt: attempt + 1, outcome: "failed_no_output", api_status: 200 });
          return null;
        }
        if (typeof data.reply === "string" || data.isComplete) {
          logApi("discovery.recovery", { requestId, attempt: attempt + 1, outcome: "recovered", tokens: "none_stored_response_replayed" });
          return { ...data, replayed: true };
        }
      } catch (error) {
        const { kind } = classifyError(error);
        // 404 = no record (older backend or race) — keep polling briefly.
        logApi("discovery.recovery", { requestId, attempt: attempt + 1, outcome: kind === "http_404" ? "no_record_yet" : "transient_error", kind });
      }
    }
    return null;
  };

  // ── sessionStorage record of the in-flight discovery turn ──────────────────
  // Enables scenario 9: refreshing mid-processing must not lose the request or
  // the response. The record is removed once the turn finishes (success or
  // terminal failure) so a stale id never resurrects an old turn.
  const ONBOARDING_REQ_KEY = "zeus_onb_active_request";
  const storeActiveDiscoveryRequest = (record) => {
    try { sessionStorage.setItem(ONBOARDING_REQ_KEY, JSON.stringify(record)); } catch {}
  };
  const readActiveDiscoveryRequest = () => {
    try {
      const raw = sessionStorage.getItem(ONBOARDING_REQ_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const clearActiveDiscoveryRequest = () => {
    try { sessionStorage.removeItem(ONBOARDING_REQ_KEY); } catch {}
  };

  /**
   * Success handling shared by THREE paths — the direct response, a recovery
   * poll, and a post-refresh recovery — so a response is processed identically
   * no matter how it reached the client. Returns true when the turn is
   * finished (success or terminal display), false when the UI fell back to the
   * retry overlay.
   */
  const applyDiscoveryResult = async (data, ctx, source = "direct") => {
    const { requestId, endpoint, partnerIntake, text, profilePatch, images, history: next } = ctx;
    const quality = responseQuality(data);
    logApi("discovery.response", {
      requestId, endpoint, source, replayed: !!data.replayed,
      api_status: quality.ok ? 200 : 200, parsed: quality.ok,
      reason: quality.reason,
    });

    // ── Connection / LLM error returned by server ──────────────────────────
    // The server returns {error: "connection_error", reply: ""} when all LLM
    // providers are exhausted. This is a REAL provider failure (not a
    // display failure): show the hard retry UI. The stored turn is marked
    // failed server-side, so a retry is safe and may generate again.
    if (data.error === "connection_error" || (!data.reply?.trim() && !data.isComplete)) {
      // Persist the user message to conversation so it isn't lost.
      await safeUpdateConversation(next);
      // Persist any accumulated profile data.
      if (data.profile && typeof data.profile === "object") {
        await persistDiscoveryProfile(data.profile, requestId);
      }
      logApi("discovery.provider_failed", { requestId, endpoint, tokens: "providers_failed_no_output", retry_safe: true });
      setChatConnectionError(true);
      setPendingRetryMsg({ text, profilePatch, images });
      return false;
    }

    // ── Credit exhausted ────────────────────────────────────────────────────
    if (data.credit_exhausted) {
      const msg = data.reply || (isAr ? "عذراً يا صاحبي، رصيد الـ AI خلص حالياً، جرّب بعد الشحن 💳" : "Sorry, AI credits are exhausted. Please try after recharging 💳");
      const aiMsg = { role: "assistant", content: msg, ts: new Date().toISOString() };
      const updated = [...next, aiMsg];
      setMessages(updated);
      await safeUpdateConversation(updated);
      logApi("discovery.credit_exhausted", { requestId, endpoint, tokens: "provider_reported_exhausted" });
      toast({ title: isAr ? "رصيد الـ AI انتهى" : "AI Credits Exhausted", description: msg, variant: "destructive" });
      activeRequestIdRef.current = null;
      return true;
    }

    // ── Successful response ─────────────────────────────────────────────────
    const replyText = (data.reply || "").trim();
    const responseProfile = {
      ...(data.profile && typeof data.profile === "object" ? data.profile : {}),
      ...profilePatch,
    };

    // Persist accumulated profile fields (never lose answers).
    await persistDiscoveryProfile(responseProfile, requestId);
    try {
      const low = text.toLowerCase();
      if (low.includes("مجان") || low.includes("free") || low.includes("يوتيوب فقط")) {
        await updateProfile({ video_preference: "free" });
      } else if (low.includes("مختلط") || low.includes("mixed") || low.includes("udemy") || low.includes("مدفوع")) {
        await updateProfile({ video_preference: "mixed" });
      }
    } catch {
      logApi("profile.persist_failed", { requestId, stage: "video_preference", db: "save_failed" });
    }

    const aiMsg = { role: "assistant", content: replyText, ts: new Date().toISOString() };
    const updated = [...next, aiMsg];
    setMessages(updated);
    setFieldComparison(Array.isArray(data.field_comparison) && data.field_comparison.length ? data.field_comparison : null);
    setChatOptions(Array.isArray(data.options) && data.options.length >= 2 ? data.options : null);
    setTyping(false);
    await safeUpdateConversation(updated);
    logApi("discovery.displayed", { requestId, endpoint, tokens: data.replayed ? "none_replayed" : "consumed_ok", db: "conversation_saved" });

    // ── Advance step when discovery is complete ─────────────────────────────
    if (data.isComplete && Object.keys(responseProfile).length) {
      const clean = cleanProfilePatch(responseProfile);
      try {
        if (partnerIntake) {
          const assignedSkills = partnerContext?.skills || [];
          await updateProfile({ ...clean, goal: partnerContext.track, target_skills: assignedSkills, onboarding_step: "assessment" });
          setKeySkills(assignedSkills);
          setStep("assessment");
        } else {
          await updateProfile({ ...clean, onboarding_step: "dna" });
          setStep("dna");
        }
        logApi("onboarding.step_advanced", { requestId, to: partnerIntake ? "assessment" : "dna", db: "saved" });
      } catch (stepErr) {
        const { kind } = classifyError(stepErr);
        logApi("onboarding.step_advance_failed", { requestId, to: partnerIntake ? "assessment" : "dna", db: "save_failed", kind });
        // Non-fatal: profile already saved server-side. Advance step locally.
        if (partnerIntake) {
          setKeySkills(partnerContext?.skills || []);
          setStep("assessment");
        } else {
          setStep("dna");
        }
      }
    }

    // Persisted + displayed: release the idempotency key for the next turn.
    setSavedRecently(true);
    activeRequestIdRef.current = null;
    return true;
  };

  // Gentle reassurance while ZEUS thinks: a slow answer is NOT a failure.
  const [slowAnswer, setSlowAnswer] = useState(false);
  // Elapsed wait counter — professional progress signal, never a failure state.
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!typing && !recovering) { setWaitSeconds(0); return undefined; }
    const interval = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [typing, recovering]);
  useEffect(() => {
    if (!typing && !recovering) { setSlowAnswer(false); return undefined; }
    const timer = setTimeout(() => setSlowAnswer(true), 12000);
    return () => clearTimeout(timer);
  }, [typing, recovering]);


  const sendDiscovery = async (text, retry = false, profilePatch = {}, images = []) => {
    // Queue consecutive messages optimistically so user sees them immediately
    if (inFlightRef.current || typing) {
      if (!retry) {
        const queuedMsg = { role: "user", content: text, images, ts: new Date().toISOString() };
        setMessages((prev) => [...prev, queuedMsg]);
        pendingQueueRef.current.push({ text, profilePatch, images });
      }
      return;
    }
    inFlightRef.current = true;

    // Idempotency key: fresh sends get a new id; retries reuse the id of the
    // turn that failed so the retry replays/recovers without new token use.
    let requestId;
    if (retry && activeRequestIdRef.current) {
      requestId = activeRequestIdRef.current;
    } else {
      requestId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeRequestIdRef.current = requestId;
    }

    const partnerIntake = user?.role === "partner_student"
      && partnerContext?.learning_mode === "doctor_assigned";
    const endpoint = partnerIntake ? "partnerGuidedIntake" : "discoveryChat";

    const userMsg = { role: "user", content: text, images, ts: new Date().toISOString() };
    const history = retry ? messages.filter((m) => !m.retryable) : messages;
    const lastMsg = history[history.length - 1];
    const isAlreadyPresent = lastMsg && lastMsg.role === "user" && lastMsg.content === text;
    const next = retry ? history : (isAlreadyPresent ? history : [...history, userMsg]);
    const discoveryProfile = { ...(profileRef.current || {}), ...profilePatch };
    setMessages(next);
    setChatBusy(true);
    setTyping(true);
    setChatOptions(null); // stale option chips must never linger over a new turn
    setChatConnectionError(false); // clear any previous error while attempting
    if (Object.keys(profilePatch).length) {
      await persistDiscoveryProfile(profilePatch, requestId);
    }
    // Remember this in-flight turn so a refresh mid-processing can pick the
    // stored response back up (request survives, no new token spent).
    storeActiveDiscoveryRequest({ requestId, text, profilePatch, images });

    const ctx = { requestId, endpoint, partnerIntake, text, profilePatch, images, history: next };

    try {
      logApi("discovery.request", { requestId, endpoint, attempt: retry ? "retry" : "first", timeout_ms: 90000, msg_count: next.length });
      const res = await api.functions.invoke(
        endpoint,
        {
          messages: next.map((m) => ({ role: m.role, content: m.content, images: m.images || [] })),
          profile: discoveryProfile,
          companionName,
          lang,
          request_id: requestId, // idempotency + response recovery key
        },
        { timeoutMs: 90000 }
      );
      const data = res.data || res;

      // The backend reports that this EXACT turn is already being computed by
      // a duplicate request — wait for its stored result instead of paying
      // for a second LLM call.
      if (data && data.pending) {
        logApi("discovery.pending", { requestId, endpoint, outcome: "awaiting_duplicate_inflight" });
        setRecovering(true);
        const recovered = await recoverDiscoveryResult(requestId);
        setRecovering(false);
        if (recovered) {
          await applyDiscoveryResult(recovered, ctx, "recovered");
        } else {
          setChatConnectionError(true);
          setPendingRetryMsg({ text, profilePatch, images });
        }
        return;
      }

      await applyDiscoveryResult(data, ctx, "direct");
    } catch (err) {
      const { kind, phase } = classifyError(err);
      // A network drop / aborted fetch does NOT mean the model never ran:
      // tokens may already be spent and the backend stores the finished
      // answer. Try to RECOVER it before showing any error — never blindly
      // re-send (that would consume a second token).
      logApi("discovery.network_error", { requestId, endpoint, phase, kind, message: err?.message });
      try { await safeUpdateConversation(next); } catch {}
      setRecovering(true);
      const recovered = await recoverDiscoveryResult(requestId);
      setRecovering(false);
      if (recovered) {
        await applyDiscoveryResult(recovered, ctx, "recovered");
        return;
      }
      // Show the hard retry UI — no synthetic text injected.
      logApi("discovery.recovery_failed", { requestId, outcome: "retry_ui_shown" });
      setChatConnectionError(true);
      setPendingRetryMsg({ text, profilePatch, images });
    } finally {
      setTyping(false);
      setChatBusy(false);
      inFlightRef.current = false;
      // Turn finished (success or terminal failure): the in-memory retry UI
      // carries the context now, so the refresh-recovery record can go.
      clearActiveDiscoveryRequest();
      // Process the next queued message (one per completed turn).
      const pending = pendingQueueRef.current.shift();
      if (pending) {
        setTimeout(() => {
          sendDiscovery(pending.text, false, pending.profilePatch, pending.images);
        }, 300);
      }
    }
  };

  // ── Refresh mid-processing: recover the in-flight turn automatically ─────
  // When the user reloads while the AI is still computing, the turn's request
  // id was stored in sessionStorage. Once the conversation is restored from the
  // server, we poll the stored response and apply it — the request is never
  // lost and no duplicate token is spent.
  const refreshRecoveryRef = React.useRef(false);
  useEffect(() => {
    if (refreshRecoveryRef.current) return;
    if (inFlightRef.current || typing || !conversation?.id) return;
    const stored = readActiveDiscoveryRequest();
    if (!stored?.requestId) return;
    refreshRecoveryRef.current = true;
    let cancelled = false;
    (async () => {
      const partnerIntake = user?.role === "partner_student"
        && partnerContext?.learning_mode === "doctor_assigned";
      const endpoint = partnerIntake ? "partnerGuidedIntake" : "discoveryChat";
      logApi("discovery.refresh_recovery", { requestId: stored.requestId, endpoint });
      // Rebuild the visible exchange: server restore may or may not include
      // the user's last message yet — never duplicate it.
      const baseMessages = conversationRef.current?.messages || [];
      const userMsg = { role: "user", content: stored.text, images: stored.images || [], ts: new Date().toISOString() };
      const next = baseMessages.some((m) => m.role === "user" && m.content === stored.text)
        ? baseMessages
        : [...baseMessages, userMsg];
      setMessages(next);
      setTyping(true);
      setRecovering(true);
      const recovered = await recoverDiscoveryResult(stored.requestId);
      setRecovering(false);
      setTyping(false);
      const ctx = {
        requestId: stored.requestId, endpoint, partnerIntake,
        text: stored.text, profilePatch: stored.profilePatch || {}, images: stored.images || [],
        history: next,
      };
      if (recovered) {
        await applyDiscoveryResult(recovered, ctx, "recovered");
      } else {
        // Keep the SAME request id so the retry button replays/recovers the
        // same turn instead of spending a new token.
        activeRequestIdRef.current = stored.requestId;
        setChatConnectionError(true);
        setPendingRetryMsg({ text: stored.text, profilePatch: stored.profilePatch || {}, images: stored.images || [] });
      }
      if (!cancelled) clearActiveDiscoveryRequest();
    })();
    return () => { cancelled = true; };
  }, [conversation?.id, typing]);


  // ---------- Goal (skills now per-goal, not aggregated) ----------
  const [goalsError, setGoalsError] = useState(false);
  const loadGoals = useCallback(async (force = false) => {
    if ((recs && !force) || !profile) return;
    // Recommendations are part of the learner's onboarding record. Restore
    // them first when returning to this step instead of spending another AI
    // request or asking the learner to describe their field again.
    if (!force && Array.isArray(profile.goal_recommendations) && profile.goal_recommendations.length >= 2) {
      setRecs({
        recommendations: profile.goal_recommendations,
        key_skills: profile.target_skills || [],
        is_comprehensive_ai_path: /\bai\b|artificial intelligence|الذكاء الاصطناعي/i.test(profile.goal || ""),
      });
      setGoalsError(false);
      return;
    }
    if (force) { setRecs(null); setGoalsError(false); }
    setTyping(true);
    try {
      const res = await api.functions.invoke("recommendGoals", { profile, goal: profile.goal, lang });
      const data = res.data || res;
      if (data.credit_exhausted) {
        setGoalsError(true);
      } else if (data.error || !Array.isArray(data.recommendations) || data.recommendations.length < 2) {
        // Never show an empty goals screen — backend retries 3x, this is the last resort
        setGoalsError(true);
      } else {
        setRecs(data);
        setGoalsError(false);
        // The server persists this too; this client write keeps resume working
        // with older servers during a rolling deployment.
        await updateProfile({ goal_recommendations: data.recommendations });
      }
      // Do not set keySkills here - wait for per-goal pick
    } catch (e) {
      setGoalsError(true);
    } finally {
      setTyping(false);
    }
  }, [profile, recs, lang]);

  useEffect(() => { if (step === "goal") loadGoals(); }, [step, loadGoals]);

  const pickGoal = async (goal, fromFieldGuide = false) => {
    // Use per-goal key_skills (fixes Backend showing HTML/CSS).
    // Guarantee: assessment NEVER opens with zero sliders.
    setTyping(true);
    let skillsForGoal = [];
    const matched = recs?.recommendations?.find((r) => r.goal === goal);
    const fieldInfo = fromFieldGuide ? findCareerField(goal) : null;
    if (fieldInfo) {
      skillsForGoal = fieldInfo.skills[isAr ? "ar" : "en"].split(/[،,]/).map((skill) => skill.trim()).filter(Boolean).slice(0, 8);
    } else if (matched?.key_skills?.length) {
      skillsForGoal = matched.key_skills;
    } else if (matched?.skills?.length) {
      skillsForGoal = matched.skills.slice(0, 8);
    } else if (Array.isArray(profile?.target_skills) && profile.target_skills.length) {
      skillsForGoal = profile.target_skills.slice(0, 8);
    } else {
      skillsForGoal = [goal];
    }
    setTyping(false);
    if (!skillsForGoal.length) {
      // Last resort stays on the goal step with an error instead of an
      // empty, broken assessment screen.
      setGoalsError(true);
      return;
    }
    setKeySkills(skillsForGoal);
    try {
      await updateProfile({ goal, goal_recommendations: recs?.recommendations || [], onboarding_step: "assessment" });
      setStep("assessment");
    } catch (error) {
      console.error("Failed to save the selected learning path:", error);
      toast({
        title: isAr ? "تعذر حفظ المسار" : "Could not save your learning path",
        description: isAr ? "اختيارك ما اتحفظش. حاول تاني." : "Your selection was not saved. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ---------- Assessment ----------
  // If user said "starting from zero" / beginner: core skills start at zero,
  // never ask for self-rated percentages. Quiz assessment replaces sliders.
  const isBeginnerProfile = (() => {
    const lvl = String(profile?.current_level || "").toLowerCase();
    const exp = `${profile?.experience || ""} ${skillsText || ""}`.toLowerCase();
    return lvl.includes("begin") || /مبتدئ|مبتدي|مبتدئة|مبتديه/.test(lvl) || /from zero|starting from zero|no experience|معنديش|من الصفر|صفر/.test(exp + " " + lvl);
  })();
  const submitSkills = async (blendedLevels) => {
    // Non-beginners must pass the mandatory mini-quiz: blended levels
    // (40% self-rating + 60% quiz score) replace raw self-ratings.
    const lv = blendedLevels || skillLevels;
    const graph = isBeginnerProfile
      ? keySkills.map((s) => ({ skill: s, level: 0 }))
      : keySkills.map((s) => ({ skill: s, level: lv[s] ?? 50 }));
    const profileUpdate = { skill_graph: graph, onboarding_step: "roadmap" };
    if (skillsText.trim()) profileUpdate.strengths = skillsText.trim();
    try {
      await updateProfile(profileUpdate);
      setStep("roadmap");
    } catch (error) {
      console.error("Failed to save the skill assessment:", error);
      toast({
        title: isAr ? "تعذر حفظ التقييم" : "Could not save your assessment",
        description: isAr ? "إجاباتك ما اتحفظتش؛ حاول مرة أخرى." : "Your assessment was not saved. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ---------- Roadmap ----------
  const [roadmapError, setRoadmapError] = useState(false);
  const [roadmapErrorMessage, setRoadmapErrorMessage] = useState("");
  const loadRoadmap = useCallback(async (force = false) => {
    if ((roadmapPreview && !force) || !profile) return;
    if (force) { setRoadmapPreview(null); setRoadmapError(false); setRoadmapErrorMessage(""); }
    setTyping(true);
    try {
      const res = await api.functions.invoke(
        "generateRoadmap",
        { profile, goal: profile.goal, lang },
        { timeoutMs: 300000 }
      );
      const data = res.data || res;
      // Never accept an error/empty payload as a "roadmap" — that produced
      // the infamous all-zeros screen and empty schedules.
      if (data && Array.isArray(data.nodes) && data.nodes.length >= 3) {
        setRoadmapPreview(data);
        setRoadmapError(false);
        setRoadmapErrorMessage("");
      } else {
        setRoadmapError(true);
        const errors = {
          openai_not_configured: isAr ? "توليد الخريطة يتطلب تفعيل أحد مزودي الذكاء الاصطناعي من إعدادات الذكاء الاصطناعي في لوحة الأدمن." : "Roadmap generation requires an AI provider key. Add or enable it in Admin AI settings.",
          provider_unavailable: isAr ? "تعذر الاتصال بمزود الذكاء الاصطناعي. راجع إعداداته واتصال الخادم وحاول تاني." : "Could not reach the AI provider. Check settings and server connectivity, then retry.",
          reviewer_failed: isAr ? "تعذر مراجعة الخريطة من المراجع المستقل. تأكد من ضبط مفتاح المراجع في لوحة الأدمن." : "Reviewer validation failed. Check reviewer key in Admin AI settings.",
          reviewer_not_configured: isAr ? "يرجى ضبط مفتاح المراجع المستقل في لوحة الأدمن لضمان جودة الخريطة." : "Please configure the reviewer API key in Admin AI settings.",
          all_providers_exhausted: isAr ? "جميع مزودي الذكاء الاصطناعي مشغولون أو انتهت حصتهم مؤقتًا. انتظر قليلًا ثم أعد المحاولة." : "All AI providers are currently exhausted or rate-limited. Please retry in a moment.",
          credit_exhausted: isAr ? "رصيد مزود الذكاء الاصطناعي غير كافٍ لتوليد الخريطة. راجع الرصيد أو فعّل مزودًا بديلاً." : "Insufficient credit on AI provider. Check billing or enable an alternative provider.",
          openai_unavailable: isAr ? "تعذر الاتصال بمزود الذكاء الاصطناعي. راجع إعداداته واتصال الخادم وحاول تاني." : "Could not reach AI provider. Check its settings and server connectivity, then retry.",
          openai_request_failed: isAr ? "فشل طلب توليد الخريطة. راجع اسم الموديل والمفتاح في لوحة الأدمن." : "AI provider rejected the roadmap request. Check the model name and API key in Admin.",
          openai_auth_failed: isAr ? "مفتاح الذكاء الاصطناعي المحفوظ غير مقبول. تأكد من المفتاح في إعدادات الذكاء الاصطناعي." : "The saved API key was rejected. Check the key in Admin AI settings.",
          openai_rate_limited: isAr ? "وصلت الطلبات إلى الحد المؤقت. انتظر قليلًا ثم أعد المحاولة." : "AI rate limit reached. Wait briefly, then retry.",
          openai_model_unavailable: isAr ? "الموديل المحدد غير متاح لهذا المفتاح. غيّر الموديل من إعدادات الأدمن." : "The selected model is unavailable for this key. Change it in Admin settings.",
          openai_timeout: isAr ? "استغرق توليد الخريطة وقتًا أطول من المتوقع. أعد المحاولة بعد قليل." : "AI took too long to respond. Please retry shortly.",
          openai_invalid_response: isAr ? "وصل رد غير مكتمل؛ الخريطة الناقصة ما اتحفظتش. جرّب تاني." : "Incomplete roadmap received; it was not saved. Please retry.",
          incomplete_roadmap: isAr ? "الخريطة ناقصها أجزاء أساسية؛ ما اتحفظتش. جرّب إعادة التوليد." : "The roadmap is missing required sections and was not saved. Please regenerate it.",
          temporary: isAr ? "حدث خطأ مؤقت أثناء توليد الخريطة. يرجى المحاولة مجددًا." : "A temporary error occurred while generating the roadmap. Please retry.",
        };
        setRoadmapErrorMessage(
          data?.credit_exhausted
            ? errors.credit_exhausted
            : errors[data?.error] || data?.reply || (isAr ? "تعذر توليد الخريطة. جرّب تاني." : "Could not generate the roadmap. Please retry.")
        );
      }
    } catch (e) {
      setRoadmapError(true);
      const timedOut = /timed out|timeout|abort/i.test(e?.message || "");
      setRoadmapErrorMessage(timedOut
        ? (isAr ? "استغرق توليد الخريطة وقتًا أطول من المتوقع. جرّب مرة أخرى." : "Roadmap generation took longer than expected. Please retry.")
        : (isAr ? "حصل خطأ في الاتصال بالخادم أثناء توليد الخريطة. حاول تاني." : "The server connection failed while generating the roadmap. Please retry."));
    } finally {
      setTyping(false);
    }
  }, [profile, roadmapPreview, lang]);

  useEffect(() => { if (step === "roadmap") loadRoadmap(); }, [step, loadRoadmap]);

  const buildRoadmap = async () => {
    const nodes = roadmapPreview?.nodes || [];
    // Guard: never persist an empty roadmap (would create an empty product).
    if (!nodes.length) { setRoadmapError(true); return; }
    setBuilding(true);
    try {
      // One server transaction saves the roadmap, all task mirrors and the
      // onboarding state. It is idempotent if a double-click/retry happens.
      const saved = await api.functions.invoke("saveOnboardingRoadmap", { goal: profile.goal, nodes });
      const roadmap = saved.data?.roadmap || saved.roadmap;
      if (!roadmap?.id) throw new Error("Roadmap was not saved");
      // Schedule generation is safely repeatable. A temporary scheduling
      // issue must not orphan a successfully saved roadmap or trap onboarding.
      try {
        await api.functions.invoke("generateSchedule", { roadmapId: roadmap.id, availableDays: profile.available_days || [], lang });
      } catch (scheduleError) {
        console.warn("Roadmap was saved but schedule generation will be retried on Learn:", scheduleError);
      }
      await updateProfile({ onboarding_step: "done" });
      nav("/app", { replace: true });
    } catch (e) {
      toast({
        title: isAr ? "تعذر حفظ الخريطة" : "Could not save the roadmap",
        description: isAr ? "خريطتك لسه معروضة؛ حصل خطأ أثناء حفظها أو تجهيز جدولها. حاول تاني." : "Your roadmap is still shown, but saving it or preparing the schedule failed. Please retry.",
        variant: "destructive",
      });
    } finally {
      setBuilding(false);
    }
  };

  if (loading || partnerContextLoading) {
    return <div className="fixed inset-0 flex items-center justify-center"><div className="w-9 h-9 border-4 border-zeus-gold/30 border-t-zeus-gold rounded-full animate-spin" /></div>;
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const partnerSetupMissing = user?.role === "partner_student"
    && partnerContext
    && !partnerContext.ready;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" dir={dir}>
      <header className="h-16 border-b border-border/40 bg-background/70 backdrop-blur-xl flex items-center justify-between px-5">
        <span className="onboarding-logo flex h-11 items-center rounded-xl px-3">
          <Logo size={30} />
        </span>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Step indicator */}
      {!fieldGuideSource && step !== "partner_intake" && <div className="px-5 py-3 border-b border-border/40 bg-card/20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    active ? "bg-zeus-gold/15 text-zeus-brightgold ring-1 ring-zeus-gold/40" : done ? "bg-zeus-gold/15 text-zeus-brightgold" : "bg-secondary/40 text-muted-foreground"
                  }`}>
                    {done ? <Check style={{ width: 16, height: 16 }} /> : <Icon style={{ width: 16, height: 16 }} />}
                  </div>
                  <span className={`text-[10px] hidden sm:block ${active ? "text-zeus-brightgold font-medium" : "text-muted-foreground"}`}>{t(s.labelKey)}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < stepIndex ? "bg-zeus-gold/40" : "bg-border/60"}`} />}
              </div>
            );
          })}
        </div>
      </div>}

      <main className="flex-1 flex items-center justify-center px-5 py-8">
        <div className={`w-full ${fieldGuideSource || (step === "discovery" && fieldComparison) ? "max-w-6xl" : "max-w-2xl"}`}>
          {partnerContextError ? (
            <div role="alert" className="zeus-glass space-y-4 rounded-2xl border border-amber-400/30 p-6 text-center">
              <p className="text-sm text-amber-200">{partnerContextError}</p>
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-border/60 px-4 py-2 text-xs font-semibold">
                {isAr ? "إعادة المحاولة" : "Retry"}
              </button>
            </div>
          ) : partnerSetupMissing ? (
            <div role="alert" className="zeus-glass space-y-3 rounded-2xl border border-amber-400/30 p-6 text-center">
              <p className="font-semibold text-amber-200">{isAr ? "مسارك التعليمي لم يُجهّز بعد" : "Your learning path is not ready yet"}</p>
              <p className="text-sm text-muted-foreground">{isAr ? "الدكتور أو مسؤول الجهة يحتاج إلى تحديد المسار والمهارات قبل أن تبدأ. تواصل معهم ثم أعد تحميل الصفحة." : "Your instructor or institution administrator needs to configure your track and skills before you can begin. Contact them, then reload this page."}</p>
            </div>
          ) : fieldGuideSource ? (
            <CareerFieldExplorer
              isAr={isAr}
              source={fieldGuideSource}
              onBack={() => setFieldGuideSource("")}
              query={fieldGuideQuery}
              onQueryChange={setFieldGuideQuery}
              selectedId={fieldGuideSelectedId}
              onSelectedChange={setFieldGuideSelectedId}
              onChoose={(goal) => {
                setFieldGuideSource("");
                void pickGoal(goal, true);
              }}
            />
          ) : (
            <>
          {step === "partner_intake" && (
            <section className="space-y-4">
              <div className="text-center">
                <p className="text-xs font-semibold text-zeus-gold">{isAr ? "إعداد مسارك مع الدكتور" : "Instructor-guided setup"}</p>
                <h1 className="mt-1 font-heading text-xl font-extrabold">{partnerContext?.track}</h1>
                {partnerContext?.instructions && <p className="mx-auto mt-2 max-w-xl whitespace-pre-wrap text-xs text-muted-foreground">{partnerContext.instructions}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{isAr ? "هسألك عن وقتك وخبرتك الحالية فقط، وبعدها نحدد مهاراتك ونبني خريطتك." : "I'll ask only about your schedule and existing experience. Then we'll check your skills and build your roadmap."}</p>
              </div>
              {bootError && !conversation ? (
                <div className="zeus-glass rounded-2xl p-6 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">{isAr ? "تعذر بدء المحادثة الموجهة." : "Could not start the guided conversation."}</p>
                  <button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-border/60 px-4 py-2 text-xs">{isAr ? "إعادة المحاولة" : "Retry"}</button>
                </div>
              ) : (
                <div className="zeus-glass flex h-[58vh] min-h-96 flex-col rounded-2xl p-4 sm:h-[60vh] sm:p-5">
                  <div className="mb-3 flex items-center gap-3 border-b border-border/60 pb-3">
                    <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" onError={withImageFallback} />
                    <div>
                      <p className="font-heading font-bold">ZEUS</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{isAr ? "أسئلة قصيرة لتخصيص خريطتك" : "A few questions to tailor your roadmap"}</span>
                        <span
                          aria-live="polite"
                          className={`inline-flex items-center gap-1 text-emerald-500 transition-opacity duration-500 ${savedRecently ? "opacity-100" : "opacity-0"}`}
                        >
                          <Check style={{ width: 12, height: 12 }} /> {isAr ? "إجابتك اتسجلت" : "Answer saved"}
                        </span>
                      </p>
                    </div>
                  </div>
                  {(chatConnectionError || recovering) && (
                    <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs"
                      style={{ borderColor: chatConnectionError && !recovering ? "rgba(239,68,68,.4)" : "rgba(212,175,55,.3)" }}>
                      <span className={chatConnectionError && !recovering ? "text-destructive" : "text-muted-foreground"}>
                        {recovering
                          ? (isAr ? "بنسترجع ردّك من السيرفر..." : "Recovering your reply from the server...")
                          : (isAr ? "حدث خطأ في الاتصال، برجاء إعادة المحاولة" : "Connection error, please try again")}
                      </span>
                      {chatConnectionError && !recovering && (
                        <button type="button" onClick={() => {
                          setChatConnectionError(false);
                          if (pendingRetryMsg) {
                            const { text, profilePatch, images } = pendingRetryMsg;
                            setPendingRetryMsg(null);
                            sendDiscovery(text, true, profilePatch, images);
                          }
                        }} className="rounded-full bg-zeus-gold/15 border border-zeus-gold/40 px-3 py-1.5 text-xs font-bold text-zeus-brightgold">
                          {isAr ? "إعادة المحاولة" : "Retry"}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="min-h-0 flex-1">
                    <ChatPanel messages={messages} onSend={(message) => sendDiscovery(message)} disabled={!conversation || chatBusy} onRetry={() => {
                      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
                      if (lastUserMessage) sendDiscovery(lastUserMessage.content, true);
                    }} typing={typing} options={chatOptions} onSelectOption={(opt) => { setChatConnectionError(false); sendDiscovery(opt, false, {}, []); }} placeholder={isAr ? "اكتب إجابتك..." : "Type your answer..."} companionName="Zeus" t={t} lang={lang} />
                  </div>
                </div>
              )}
            </section>
          )}
          {step === "discovery" && bootError && !conversation && (
            <div className="zeus-glass p-8 text-center animate-fade-up">
              <p className="text-muted-foreground mb-4 text-sm">{isAr ? "مقدرتش أبدأ المحادثة. اتأكد إن السيرفر شغال وحاول تاني." : "Couldn't start the chat. Make sure the server is running and retry."}</p>
              <button onClick={() => { setBootError(false); startedRef.current = false; window.location.reload(); }} className="px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold text-sm">
                {isAr ? "إعادة المحاولة" : "Retry"}
              </button>
            </div>
          )}
              {step === "discovery" && !bootError && (
            <>
                <div className={fieldComparison ? "grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)] lg:items-start" : ""}>
                <div className="zeus-glass p-4 sm:p-5 h-[58vh] sm:h-[60vh] flex flex-col">
              <div className="mb-3 pb-3 border-b border-border/60 flex items-center gap-3">
                <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="w-10 h-10 rounded-full object-cover object-top shrink-0" onError={withImageFallback} />
                <div className="min-w-0 flex-1">
                  <div className="font-heading font-bold text-lg">{companionName || t("onb.name.default")} — {isAr ? "رفيقك في التعلّم" : "Your Learning Companion"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{isAr ? "محادثة طبيعية عشان أفهمك" : "A natural conversation to understand you"}</span>
                    {slowAnswer && !recovering && (
                      <span className="inline-flex items-center gap-1 text-zeus-brightgold/80">
                        {isAr ? "زيوس بيفكر بعمق، لحظات 💭" : "ZEUS is thinking deeply, one moment 💭"}
                      </span>
                    )}
                    <span
                      aria-live="polite"
                      className={`inline-flex items-center gap-1 text-emerald-500 transition-opacity duration-500 ${savedRecently ? "opacity-100" : "opacity-0"}`}
                    >
                      <Check style={{ width: 12, height: 12 }} /> {isAr ? "إجابتك اتسجلت" : "Answer saved"}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setFieldGuideSource("discovery")} disabled={!conversation || chatBusy} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground transition hover:bg-secondary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" aria-label={isAr ? "استكشف المجالات" : "Explore fields"}>
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">{isAr ? "دليل المجالات" : "Field guide"}</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 relative flex flex-col">
                {chatConnectionError && !recovering && (
                  <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs animate-fade-in">
                    <span className="font-semibold text-destructive">
                      {isAr ? "تعذر استلام الرد من الخادم، برجاء إعادة المحاولة" : "Connection error, please try again"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setChatConnectionError(false);
                        if (pendingRetryMsg) {
                          const { text, profilePatch, images } = pendingRetryMsg;
                          setPendingRetryMsg(null);
                          sendDiscovery(text, true, profilePatch, images);
                        }
                      }}
                      className="rounded-full bg-zeus-gold/20 border border-zeus-gold/50 px-3.5 py-1 text-xs font-bold text-zeus-brightgold hover:bg-zeus-gold/30 transition"
                    >
                      {isAr ? "إعادة المحاولة" : "Retry"}
                    </button>
                  </div>
                )}
                <ChatPanel messages={messages} onSend={(text, images) => { setChatConnectionError(false); sendDiscovery(text, false, {}, images); }} disabled={!conversation || chatBusy} onRetry={() => {
                  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
                  if (lastUserMessage) sendDiscovery(lastUserMessage.content, true, {}, lastUserMessage.images || []);
                }} typing={typing} options={chatOptions} onSelectOption={(opt) => { setChatConnectionError(false); sendDiscovery(opt, false, {}, []); }} placeholder={isAr ? "اكتب ردك..." : "Type your reply..."} companionName={companionName} t={t} lang={lang} />
              </div>
            </div>
            {fieldComparison && (
              <div className="mt-4 max-h-[45vh] overflow-y-auto space-y-3 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4 lg:max-h-[60vh]">
                <div className="text-xs font-semibold uppercase tracking-wide text-zeus-brightgold flex items-center gap-1.5">
                  <GitCompare style={{ width: 13, height: 13 }} /> {isAr ? "مقارنة المجالات" : "Field Comparison"}
                </div>
                {fieldComparison.map((f, i) => (
                  <div key={i} className="zeus-glass p-4">
                    <h3 className="font-heading font-bold text-sm mb-2">{f.field}</h3>
                    {f.description && <p className="text-xs text-muted-foreground mb-2">{f.description}</p>}
                    {f.difficulty && <p className="text-xs mb-1.5"><span className="font-semibold text-zeus-brightgold">{isAr ? "الصعوبة: " : "Difficulty: "}</span><span className="text-muted-foreground">{f.difficulty}</span></p>}
                    {f.daily_tasks && <p className="text-xs mb-2"><span className="font-semibold">{isAr ? "المهام اليومية: " : "Daily Tasks: "}</span><span className="text-muted-foreground">{f.daily_tasks}</span></p>}
                    {f.job_titles?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "الوظائف" : "Job Titles"}</span><div className="flex flex-wrap gap-1">{f.job_titles.map((j, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-zeus-gold/10 text-zeus-brightgold text-[10px]">{j}</span>)}</div></div>}
                    {f.skills?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "المهارات" : "Skills"}</span><div className="flex flex-wrap gap-1">{f.skills.map((s, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{s}</span>)}</div></div>}
                    {f.example_projects?.length > 0 && (
                      <div className="mb-2 p-2.5 rounded-xl bg-zeus-gold/5 border border-zeus-gold/15">
                        <span className="text-[10px] font-bold text-zeus-brightgold block mb-1">{isAr ? "مثال مشروع حقيقي" : "Real Project Example"}</span>
                        {f.example_projects.map((p, k) => <p key={k} className="text-[11px] text-muted-foreground mb-0.5">• {p}</p>)}
                      </div>
                    )}
                    {f.estimated_learning_time && <p className="text-xs mb-2"><span className="font-semibold text-muted-foreground">{isAr ? "مدة تقريبية للتعلّم: " : "Estimated learning time: "}</span><span className="text-muted-foreground">{f.estimated_learning_time}</span></p>}
                    {f.estimated_learning_time_note && <p className="text-[11px] text-muted-foreground mb-2">{f.estimated_learning_time_note}</p>}
                    {f.why_fits && <div className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">{f.why_fits}</div>}
                    <button type="button" onClick={() => {
                      const selectedField = findCareerField(f.field);
                      void sendDiscovery(
                        selectedField?.title[isAr ? "ar" : "en"] || f.field,
                        false,
                        selectedField ? { goal: selectedField.title.en, field_comparison_pending: true } : {},
                      );
                    }} disabled={typing} className="mt-3 w-full rounded-full bg-secondary/40 border border-border/70 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/70 disabled:opacity-50">
                      {isAr ? `أنا ميّال لـ ${f.field}` : `I'm leaning toward ${f.field}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>
            </>
          )}
          {step === "dna" && <DnaSummary profile={profile} isAr={isAr} Arrow={Arrow} onBack={() => setStep("discovery")} onConfirm={() => goto("goal")} />}
          {step === "goal" && <GoalStep recs={recs} profile={profile} typing={typing} onPick={pickGoal} onRetry={() => loadGoals(true)} goalsError={goalsError} t={t} isAr={isAr} onOpenGuide={() => setFieldGuideSource("goal")} />}
          {step === "assessment" && <AssessmentStep skills={keySkills} levels={skillLevels} setLevels={setSkillLevels} skillsText={skillsText} setSkillsText={setSkillsText} onSubmit={submitSkills} t={t} isAr={isAr} Arrow={Arrow} isBeginner={isBeginnerProfile} goal={profile?.goal} lang={lang} />}
          {step === "roadmap" && <RoadmapReveal preview={roadmapPreview} typing={typing} building={building} onBuild={buildRoadmap} onRetry={() => loadRoadmap(true)} error={roadmapError} errorMessage={roadmapErrorMessage} isAr={isAr} companionName={companionName} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function GoalStep({ recs, profile, typing, onPick, onRetry, goalsError, t, isAr, onOpenGuide }) {
  const [custom, setCustom] = useState("");
  const [expanded, setExpanded] = useState(0);
  const empty = !recs || !Array.isArray(recs.recommendations) || recs.recommendations.length === 0;
  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "اختيار المسار" : "Choose your direction"}</div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{isAr ? "مجالات ممكن تناسبك" : "Fields that may fit you"}</h2>
        <button type="button" onClick={onOpenGuide} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm text-muted-foreground transition hover:bg-secondary/50 hover:text-foreground">
          <BookOpen className="h-4 w-4" />
          {isAr ? "افتح دليل المجالات" : "Open the field guide"}
        </button>
        <p className="text-muted-foreground mt-2 text-sm">{recs?.is_comprehensive_ai_path
          ? (isAr ? `بناءً على ميولك وهدفك${profile?.goal ? ` (${profile.goal})` : ""}، هتلاقي مسار AI Engineer الشامل الأول وبعده تخصصات بديلة. افتح التفاصيل وقارن طبيعة الشغل والمهارات والمشاريع قبل ما تختار.` : `Based on your interests and goals${profile?.goal ? ` (${profile.goal})` : ""}, you'll see the full AI Engineer path first, followed by optional specializations. Open the details and compare the work, skills, and projects before choosing.`)
          : (isAr ? `بناءً على ميولك وهدفك${profile?.goal ? ` (${profile.goal})` : ""}، قارن طبيعة الشغل والمهارات والمشاريع قبل ما تختار.` : `Based on your interests and goals${profile?.goal ? ` (${profile.goal})` : ""}, compare the work, skills, and projects before choosing.`)}</p>
      </div>
      {typing ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="text-zeus-gold animate-spin" style={{ width: 32, height: 32 }} />
          <p className="text-muted-foreground text-sm">{isAr ? "بحلّل أفضل مسار ليك..." : "Analyzing your best path..."}</p>
        </div>
      ) : (goalsError || empty) ? (
        <div className="zeus-glass p-8 text-center">
          <p className="text-muted-foreground mb-4 text-sm">{isAr ? "تعثر تحليل الأهداف — دوس إعادة المحاولة" : "Goal analysis stumbled — hit retry"}</p>
          <button onClick={onRetry} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold text-sm">
            {isAr ? "إعادة المحاولة" : "Retry"}
          </button>
          <div className="zeus-glass p-4 mt-4">
            <label className="text-xs text-muted-foreground block mb-1.5">{isAr ? "أو اكتب هدفك مباشرة" : "Or type your goal directly"}</label>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isAr ? "اكتب هدفك" : "Your goal"}
                className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:zeus-gold-border" />
              <button onClick={() => custom.trim() && onPick(custom.trim())} className="px-4 rounded-lg bg-zeus-gold text-zeus-midnight font-medium text-sm">{isAr ? "تأكيد" : "Confirm"}</button>
            </div>
          </div>
        </div>
      ) : recs ? (
        <div className="space-y-3">
          {recs.recommendations?.map((r, i) => (
            <div key={i} className="zeus-glass overflow-hidden">
              <button onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-start p-4 hover:zeus-gold-border transition">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-heading font-bold text-lg">{r.goal}{i === 0 && recs.is_comprehensive_ai_path && <span className="ms-2 align-middle text-[10px] rounded-full px-2 py-1 bg-zeus-gold/15 text-zeus-brightgold">{isAr ? "المسار الشامل" : "Full path"}</span>}</span>
                  <span className="text-zeus-gold font-bold text-sm">{isAr ? `توافق ${r.score}%` : `${r.score}% fit`}</span>
                </div>
                <p className="text-muted-foreground text-sm">{r.reason}</p>
                <div className="mt-2 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${r.score}%` }} />
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-2">{r.description}</p>}
                <span className="text-xs text-zeus-brightgold mt-2 inline-block">{expanded === i ? (isAr ? "إخفاء التفاصيل ▲" : "Hide details ▲") : (isAr ? "عرض التفاصيل ▼" : "View details ▼")}</span>
              </button>
              {expanded === i && (
                <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-border/40 pt-3">
                  {r.nature && <Detail label={isAr ? "طبيعة العمل" : "Nature of Work"} value={r.nature} />}
                  {r.key_skills?.length > 0 && <Chips label={isAr ? "المهارات المطلوبة" : "Key Skills"} items={r.key_skills} />}
                  {r.tools?.length > 0 && <Chips label={isAr ? "الأدوات" : "Tools"} items={r.tools} />}
                  {r.job_titles?.length > 0 && <Chips label={isAr ? "الوظائف" : "Job Titles"} items={r.job_titles} />}
                  {r.example_projects?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "مشاريع حقيقية" : "Real Projects"}</div>
                      {r.example_projects.map((p, k) => <p key={k} className="text-xs text-muted-foreground mb-1">• {p}</p>)}
                    </div>
                  )}
                  {r.current_level && <Detail label={isAr ? "مستواك الحالي" : "Your Current Level"} value={r.current_level} />}
                  {r.gap && <Detail label={isAr ? "الفجوة" : "The Gap"} value={r.gap} />}
                  {r.what_to_learn && <Detail label={isAr ? "إيه اللي محتاج تتعلمه" : "What to Learn"} value={r.what_to_learn} />}
                  {r.learning_outline?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "هتتعلم بالترتيب" : "What you will learn"}</div>
                      <ol className="list-decimal ps-5 space-y-1">
                        {r.learning_outline.map((item, k) => <li key={k} className="text-xs text-muted-foreground">{item}</li>)}
                      </ol>
                    </div>
                  )}
                  {r.tradeoffs && <Detail label={isAr ? "خد بالك" : "Trade-offs"} value={r.tradeoffs} />}
                  {r.why_fits && <div className="p-3 rounded-xl bg-zeus-gold/10 border border-zeus-gold/20"><p className="text-xs text-zeus-brightgold"><span className="font-bold">{isAr ? "ليه يناسبك: " : "Why it fits: "}</span>{r.why_fits}</p></div>}
                  <button onClick={() => onPick(r.goal)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold">
                    {isAr ? "اختار المسار ده" : "Choose this path"} <ArrowRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="zeus-glass p-4">
            <label className="text-xs text-muted-foreground block mb-1.5">{isAr ? "أو اكتب هدف مختلف" : "Or type a different goal"}</label>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isAr ? "اكتب هدفك" : "Your goal"}
                className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:zeus-gold-border" />
              <button onClick={() => custom.trim() && onPick(custom.trim())} className="px-4 rounded-lg bg-zeus-gold text-zeus-midnight font-medium text-sm">{isAr ? "تأكيد" : "Confirm"}</button>
            </div>
          </div>
        </div>
      ) : <p className="text-center text-muted-foreground">{isAr ? "حصل خطأ، حدّث الصفحة" : "Something went wrong, refresh"}</p>}
    </div>
  );
}

function Detail({ label, value }) {
  return <div><span className="text-xs font-bold text-zeus-brightgold">{label}: </span><span className="text-xs text-muted-foreground">{value}</span></div>;
}

function Chips({ label, items }) {
  return (
    <div>
      <div className="text-xs font-bold text-zeus-brightgold mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">{items.map((s, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{s}</span>)}</div>
    </div>
  );
}

function AssessmentStep({ skills, levels, setLevels, skillsText, setSkillsText, onSubmit, t, isAr, Arrow, isBeginner, goal, lang }) {
  const [quizState, setQuizState] = useState("idle"); // idle|loading|taking|submitted|error
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const blendedPreview = quizScore === null ? null
    : Object.fromEntries(skills.map((s) => [s, Math.round(((levels[s] ?? 50) * 0.4) + (quizScore * 0.6))]));

  const startQuiz = async () => {
    setQuizState("loading");
    try {
      const res = await api.functions.invoke("generateAssessmentQuiz", { goal, skills, lang });
      const data = res.data || res;
      if (data.credit_exhausted) { setQuizState("error"); return; }
      if (data.questions?.length >= 3) {
        setQuestions(data.questions.slice(0, 5));
        setAnswers({});
        setQuizScore(null);
        setQuizState("taking");
      } else {
        setQuizState("error");
      }
    } catch {
      setQuizState("error");
    }
  };

  const submitQuiz = () => {
    let correct = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
    setQuizScore(questions.length ? Math.round((correct / questions.length) * 100) : 0);
    setQuizState("submitted");
  };

  const finish = () => {
    // Mandatory quiz gate: cannot build the roadmap without a quiz score.
    if (quizScore === null || !blendedPreview) return;
    onSubmit(blendedPreview);
  };
  if (isBeginner) {
    return (
      <div className="animate-fade-up">
        <div className="text-center mb-6">
          <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "تقييم سريع" : "Quick Assessment"}</div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("onb.assess.title")}</h2>
          <p className="text-muted-foreground mt-2 text-sm">{isAr ? "بما إنك بتبدأ من الصفر، ثبّتنا مهاراتك الأساسية على مستوى مبتدئ تلقائيًا — من غير ما تقيّم نفسك بنسب." : "Since you're starting from zero, we've set your core skills to Beginner automatically — no self-rating needed."}</p>
        </div>
        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s} className="zeus-glass p-4 flex items-center justify-between">
              <span className="font-medium">{s}</span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-zeus-gold/15 text-zeus-brightgold">{isAr ? "مبتدئ" : "Beginner"}</span>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <button onClick={onSubmit} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold">
            {isAr ? "ابني خريطتي" : "Build my roadmap"} <Arrow style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "تقييم سريع" : "Quick Assessment"}</div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("onb.assess.title")}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{isAr ? "قيّم نفسك مبدئيًا، وبعدها اختبار قصير إجباري (5 أسئلة) يظبط تقييمك — مش هنعتمد على رأيك لوحده." : "Rate yourself first, then a mandatory short quiz (5 questions) calibrates it — no self-rating alone."}</p>
      </div>
      <div className="space-y-4">
        {skills.map((s) => {
          const shown = blendedPreview ? blendedPreview[s] : (levels[s] ?? 50);
          return (
            <div key={s} className="zeus-glass p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{s}</span>
                <span className="text-zeus-gold font-bold">{shown}%{blendedPreview && <span className="text-[10px] text-muted-foreground font-normal"> {isAr ? "(بعد المعايرة)" : "(calibrated)"}</span>}</span>
              </div>
              <input type="range" min="0" max="100" value={levels[s] ?? 50}
                onChange={(e) => setLevels({ ...levels, [s]: Number(e.target.value) })}
                className="w-full accent-zeus-gold" />
            </div>
          );
        })}
      </div>
      <div className="zeus-glass p-4 mt-4">
        <label className="text-xs font-semibold text-zeus-brightgold block mb-2">{isAr ? "احكي لنا عن مهاراتك بالتفصيل" : "Tell us about your skills in detail"}</label>
        <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} rows={3}
          placeholder={isAr ? "اكتب إيه اللي تقدر تعمله فعليًا، الأدوات اللي استخدمتها، والمشاريع اللي اشتغلت عليها..." : "Write what you can actually do, tools you've used, and projects you've worked on..."}
          className="w-full bg-transparent border border-border/60 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:zeus-gold-border resize-none" />
      </div>

      {/* Mandatory mini-quiz */}
      <div className="zeus-glass p-5 mt-4">
        <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "الاختبار القصير (إجباري) 🧪" : "Short Quiz (required) 🧪"}</h3>
        <p className="text-xs text-muted-foreground mb-3">{isAr ? "5 أسئلة من مستوى مهاراتك — لازم تخلّصه عشان نبني خطتك. درجتك هتتدمج مع تقييمك (40% رأيك + 60% الاختبار)." : "5 questions on your skills — required before building your plan. Blended 40% self + 60% quiz."}</p>
        {quizState === "idle" && (
          <button onClick={startQuiz} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-secondary/60 border border-zeus-gold/40 text-zeus-brightgold font-semibold text-sm hover:bg-zeus-gold/10 transition">
            {isAr ? "ابدأ الاختبار القصير" : "Start Short Quiz"}
          </button>
        )}
        {quizState === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> {isAr ? "بجهّز أسئلتك..." : "Preparing your questions..."}</div>
        )}
        {quizState === "error" && (
          <div className="space-y-2">
            <p className="text-xs text-destructive">{isAr ? "تعثر تجهيز الاختبار — حاول تاني (إجباري قبل المتابعة)." : "Quiz setup stumbled — retry (required to continue)."}</p>
            <button onClick={startQuiz} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-secondary/60 border border-border/60 text-sm hover:border-zeus-gold/40 transition">{isAr ? "إعادة المحاولة" : "Retry"}</button>
          </div>
        )}
        {(quizState === "taking" || quizState === "submitted") && (
          <div className="space-y-3 mt-1">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded-xl bg-secondary/20 border border-border/40 p-3.5">
                <p className="font-medium text-sm mb-2.5">{qi + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {(q.options || []).map((opt, oi) => {
                    const picked = answers[qi] === oi;
                    const reveal = quizState === "submitted";
                    const isRight = oi === q.correct;
                    return (
                      <button key={oi} disabled={reveal} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                        className={`w-full text-start p-2.5 rounded-lg border text-sm transition flex items-center gap-2 ${reveal && isRight ? "bg-emerald-500/15 border-emerald-500/50" : reveal && picked ? "bg-destructive/10 border-destructive/40" : picked ? "bg-zeus-gold/15 border-zeus-gold/50" : "bg-transparent border-border/40 hover:border-zeus-gold/30"}`}>
                        <span className="text-[11px] font-bold opacity-70">{String.fromCharCode(65 + oi)}</span> {opt}
                      </button>
                    );
                  })}
                </div>
                {quizState === "submitted" && q.explanation && <p className="text-[11px] text-muted-foreground mt-2">💡 {q.explanation}</p>}
              </div>
            ))}
            {quizState === "taking" && (
              <button onClick={submitQuiz} disabled={Object.keys(answers).length < questions.length}
                className="w-full py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition disabled:opacity-50">
                {isAr ? `سلّم الاختبار (${Object.keys(answers).length}/${questions.length})` : `Submit (${Object.keys(answers).length}/${questions.length})`}
              </button>
            )}
            {quizState === "submitted" && (
              <div className="rounded-xl bg-zeus-gold/10 border border-zeus-gold/30 p-3.5 text-sm">
                <span className="font-bold text-zeus-brightgold">{isAr ? `درجتك: ${quizScore}%` : `Your score: ${quizScore}%`}</span>
                <span className="text-muted-foreground"> — {isAr ? "اتظبطت مستوياتك تلقائيًا فوق." : "your levels above were auto-calibrated."} </span>
                <button onClick={startQuiz} className="text-zeus-brightgold underline text-xs">{isAr ? "إعادة الاختبار" : "Retake"}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-center mt-6">
        <button onClick={finish} disabled={quizScore === null}
          title={quizScore === null ? (isAr ? "لازم تخلّص الاختبار القصير الأول" : "Finish the short quiz first") : ""}
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50">
          {isAr ? "ابني خريطتي" : "Build my roadmap"} <Arrow style={{ width: 18, height: 18 }} />
        </button>
        {quizScore === null && <p className="text-[11px] text-muted-foreground mt-2">{isAr ? "زرار بناء الخطة هيفتح بعد الاختبار القصير." : "Plan building unlocks after the short quiz."}</p>}
      </div>
    </div>
  );
}
