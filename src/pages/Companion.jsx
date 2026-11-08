import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import ChatPanel from "@/components/zeus/ChatPanel";

export default function Companion() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [roadmap, setRoadmap] = useState(null);
  const [currentTask, setCurrentTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const inFlightRef = useRef(false);
  const conversationRef = useRef(null);
  conversationRef.current = conversation;
  const pendingMessageRef = useRef(null);

  const safeUpdateConversation = async (msgs) => {
    const convo = conversationRef.current;
    if (!convo?.id) return;
    try {
      await api.entities.Conversation.update(convo.id, { messages: msgs });
    } catch (error) {
      console.error("Failed to save companion conversation:", error);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1);
        if (r.length) setRoadmap(r[0]);
        const tk = await api.entities.Task.filter({ status: { $ne: "done" } }, "order", 1);
        if (tk.length) setCurrentTask(tk[0]);
        const conv = await api.entities.Conversation.filter({ type: "companion" }, "-created_date", 1);
        if (conv.length) {
          setConversation(conv[0]);
          setMessages(conv[0].messages || []);
        } else {
          // No fixed greeting by design: first message is crafted by the LLM
          // from the user's real goal/progress.
          const c = await api.entities.Conversation.create({
            type: "companion", companion_name: profile?.companion_name || "ZEUS", messages: [],
          });
          setConversation(c);
          setMessages([]);
          try {
            const res = await api.functions.invoke("companionChat", {
              messages: [], profile, roadmap: r[0], currentTask: tk[0],
              companionName: profile?.companion_name, lang, greet: true,
            });
            const data = res.data || res;
            const txt = (data.reply || "").trim();
            if (txt) {
              const greet = [{ role: "assistant", content: txt, ts: new Date().toISOString() }];
              setMessages(greet);
              await api.entities.Conversation.update(c.id, { messages: greet });
            }
          } catch (error) {
            console.error("Failed to load companion greeting:", error);
          }
        }
        setInitError(false);
      } catch (error) {
        console.error("Failed to initialize companion chat:", error);
        setInitError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAttempt]);

  const send = async (text, images = [], retry = false) => {
    if (inFlightRef.current || typing) {
      if (!retry) pendingMessageRef.current = { text, images };
      return;
    }
    inFlightRef.current = true;
    const userMsg = { role: "user", content: text, images, ts: new Date().toISOString() };
    const history = retry ? messages.filter((message) => !message.retryable) : messages;
    const next = retry ? history : [...history, userMsg];
    setMessages(next);
    setChatBusy(true);
    setTyping(true);
    try {
      // Auto-retry transient failures once — 2.5 s gap to let the provider recover.
      let res;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          res = await api.functions.invoke("companionChat", {
            messages: next.map((m) => ({ role: m.role, content: m.content, images: m.images || [] })),
            profile, roadmap, currentTask, companionName: profile?.companion_name, lang
          }, { timeoutMs: 90000 });
          break;
        } catch (e2) {
          const isTransient = /timed out|timeout|abort|network|fetch|connection|ERR_|failed to fetch|load failed/i.test(e2?.message || "");
          if (attempt < 1 && isTransient) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          throw e2;
        }
      }
      const data = res.data || res;
      const replyText = (data.reply || "").trim();
      if (!replyText && !retry) {
        // Silent background retry on empty reply — avoids false-positive error bubbles.
        try {
          const retryRes = await api.functions.invoke("companionChat", {
            messages: next.map((m) => ({ role: m.role, content: m.content, images: m.images || [] })),
            profile, roadmap, currentTask, companionName: profile?.companion_name, lang
          }, { timeoutMs: 90000 });
          const rd = retryRes.data || retryRes;
          const rt = (rd.reply || "").trim();
          if (rt) {
            const aiMsg = { role: "assistant", content: rt, ts: new Date().toISOString() };
            const updated = [...next, aiMsg];
            setMessages(updated);
            setTyping(false);
            await safeUpdateConversation(updated);
            return;
          }
        } catch { /* fall through */ }
      }
      const aiMsg = {
        role: "assistant",
        content: replyText || (isAr ? "عطل بسيط — دوس إعادة المحاولة 🔄" : "Brief hiccup — tap retry 🔄"),
        ts: new Date().toISOString(),
        ...(!replyText ? { retryable: true } : {}),
      };
      const updated = [...next, aiMsg];
      setMessages(updated);
      setTyping(false);
      await safeUpdateConversation(updated);
    } catch (e) {
      // Persist the user's message before showing the error.
      try { await safeUpdateConversation(next.filter((message) => !message.retryable)); } catch {}
      const timedOut = /timed out|timeout|abort/i.test(e?.message || "");
      setMessages([...next.filter((message) => !message.retryable), {
        role: "assistant",
        content: timedOut
          ? (isAr ? "الرد اتأخر قليلاً — دوس إعادة المحاولة 🔄" : "Took a bit longer — tap retry 🔄")
          : (isAr ? "عطل بسيط — دوس إعادة المحاولة 🔄" : "Brief hiccup — tap retry 🔄"),
        ts: new Date().toISOString(),
        retryable: true,
      }]);
    } finally {
      setTyping(false);
      setChatBusy(false);
      inFlightRef.current = false;
      const pending = pendingMessageRef.current;
      if (pending) {
        pendingMessageRef.current = null;
        setTimeout(() => { send(pending.text, pending.images); }, 300);
      }
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
  if (initError) return (
    <div dir={dir} className="zeus-glass p-6 max-w-xl mx-auto text-center">
      <p className="text-sm text-muted-foreground mb-4">{isAr ? "تعذر تحميل المحادثة الآن. تحقق من اتصالك وحاول مرة أخرى." : "The conversation could not be loaded. Check your connection and try again."}</p>
      <button type="button" onClick={() => { setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}
        className="px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold">
        {isAr ? "إعادة المحاولة" : "Retry"}
      </button>
    </div>
  );

  return (
    <div dir={dir} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-zeus-gold to-zeus-brightgold flex items-center justify-center"><MessageSquare className="text-white" style={{ width: 22, height: 22 }} /></div>
        <div>
          <h1 className="font-heading font-extrabold text-2xl">{profile?.companion_name || "ZEUS"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "رفيقك في التعلّم — فاهم خريطتك ومهامك" : "Your learning companion — knows your roadmap & tasks"}</p>
        </div>
      </div>
      <div className="zeus-glass p-5 h-[65vh] flex flex-col">
        <ChatPanel messages={messages} onSend={send} onRetry={() => {
          const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
          if (lastUserMessage) send(lastUserMessage.content, lastUserMessage.images || [], true);
        }} typing={typing} disabled={!conversation || chatBusy} placeholder={t("companion.placeholder")} companionName={profile?.companion_name} t={t} lang={lang} />
      </div>
    </div>
  );
}