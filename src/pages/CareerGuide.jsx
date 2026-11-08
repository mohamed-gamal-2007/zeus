import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, Briefcase, ChartBar, Check, ChevronRight, ChevronLeft,
  Code2, Compass, FileText, GitCompare, LayoutTemplate, Megaphone, Palette, Rocket, Scale,
  Search, Shield, Sparkles, Target, Trophy, Users, X,
} from "lucide-react";
import {
  CAREER_FIELDS, CAREER_GROUPS, getFieldSearchTerms, getFieldText,
} from "@/data/careerFields";
import { useI18n } from "@/lib/i18n";

const GROUP_ICONS = {
  brain: Brain,
  code: Code2,
  chart: ChartBar,
  shield: Shield,
  megaphone: Megaphone,
  palette: Palette,
  layout: LayoutTemplate,
  rocket: Rocket,
};

/* `CAREER_GROUPS` stores `[ar, en]` pairs for basics/roadmap/opportunity. */
const groupBasics = (group, isAr) => group?.basics?.[0]?.[isAr ? 0 : 1] || "";
const groupOpportunity = (group, isAr) => group?.opportunity?.[0]?.[isAr ? 0 : 1] || "";
const groupRoadmap = (group, isAr) => (group?.roadmap || []).map((pair) => (isAr ? pair?.[0] : pair?.[1]));

/**
 * Career Guide — the platform's career exploration page.
 * Hero → 8 category cards → field details → interactive comparison.
 * All content comes from the shared `src/data/careerFields.js` dataset
 * (the same source the onboarding field guide uses) so wording never
 * drifts between the two surfaces.
 */
export default function CareerGuide() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const DetailArrow = isAr ? ChevronLeft : ChevronRight;

  const [activeGroup, setActiveGroup] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [comparing, setComparing] = useState(false);

  const selected = CAREER_FIELDS.find((entry) => entry.id === selectedId);
  const groupOf = (entry) => CAREER_GROUPS.find((item) => item.categories.includes(entry?.category));

  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    let list = CAREER_FIELDS;
    if (activeGroup) {
      const group = CAREER_GROUPS.find((item) => item.id === activeGroup);
      const cats = new Set(group?.categories || []);
      list = list.filter((entry) => cats.has(entry.category));
    }
    if (!normalized) return list;
    return list.filter((entry) => {
      const fieldText = [entry.id, entry.title.ar, entry.title.en, entry.summary.ar, entry.summary.en];
      const matchesText = fieldText.some((value) => (
        normalized.length < 3
          ? value.toLocaleLowerCase() === normalized
          : value.toLocaleLowerCase().includes(normalized)
      ));
      const matchesAlias = getFieldSearchTerms(entry).some((value) => (
        value.toLocaleLowerCase() === normalized
        || (normalized.length >= 3 && value.toLocaleLowerCase().includes(normalized))
      ));
      return matchesText || matchesAlias;
    });
  }, [query, activeGroup]);

  const compareFields = useMemo(
    () => compareIds.map((id) => CAREER_FIELDS.find((entry) => entry.id === id)).filter(Boolean),
    [compareIds],
  );

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const openGroup = (id) => {
    setActiveGroup((prev) => (prev === id ? "" : id));
    setSelectedId("");
    setQuery("");
    document.getElementById("fields-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openFieldFromCompare = (entry) => {
    setActiveGroup(groupOf(entry)?.id || "");
    setQuery("");
    setSelectedId(entry.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Keep the compare tray tidy: remove ids the user cleared in other views. */
  useEffect(() => {
    if (comparing && compareFields.length < 2) setComparing(false);
  }, [comparing, compareFields.length]);

  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  /* ── Comparison view ───────────────────────────────────────────────────── */
  if (comparing && compareFields.length >= 2) {
    return (
      <div dir={dir} className="mx-auto w-full max-w-6xl animate-fade-up px-1">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setComparing(false)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-secondary/50"
          >
            <BackArrow className="h-4 w-4" />
            {isAr ? "رجوع" : "Back"}
          </button>
          <h1 className="inline-flex items-center gap-2 font-heading text-xl font-bold sm:text-2xl">
            <Scale className="h-5 w-5 text-zeus-brightgold" />
            {isAr ? "مقارنة بين المجالات" : "Comparing fields"}
          </h1>
          <span className="text-xs text-muted-foreground">{compareFields.length} / 3</span>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-border/70 bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-start">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/30">
                <th className="p-4 text-start text-xs font-medium text-muted-foreground">{isAr ? "المعيار" : "Criterion"}</th>
                {compareFields.map((entry) => (
                  <th key={entry.id} className="min-w-56 p-4 text-start">
                    <button type="button" onClick={() => openFieldFromCompare(entry)} className="block text-base font-bold hover:underline">
                      {getFieldText(entry, "title", isAr)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareIds((prev) => {
                        const left = prev.filter((item) => item !== entry.id);
                        if (left.length === 1) setComparing(false);
                        return left;
                      })}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" /> {isAr ? "إزالة" : "Remove"}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                ["summary", isAr ? "الملخص" : "Overview"],
                ["about", isAr ? "المجال معناه إيه" : "What it is"],
                ["work", isAr ? "شكل الشغل" : "Typical work"],
                ["roles", isAr ? "الوظائف" : "Common roles"],
                ["skills", isAr ? "المهارات المطلوبة" : "Required skills"],
                ["project", isAr ? "تطبيق عملي" : "Practical application"],
              ].map(([key, label]) => (
                <tr key={key}>
                  <th scope="row" className="w-28 align-top p-4 text-xs font-semibold text-muted-foreground">{label}</th>
                  {compareFields.map((entry) => (
                    <td key={entry.id} className="align-top p-4 text-sm leading-7 text-muted-foreground">
                      {key === "roles" ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {getFieldText(entry, "roles", isAr).map((role) => (
                            <li key={role} className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-foreground">{role}</li>
                          ))}
                        </ul>
                      ) : getFieldText(entry, key, isAr)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {compareFields.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => openFieldFromCompare(entry)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-zeus-gold px-5 text-sm font-semibold text-zeus-midnight transition hover:bg-zeus-brightgold shadow-gold"
            >
              <Check className="h-4 w-4" />
              {isAr ? `فتح تفاصيل ${getFieldText(entry, "title", isAr)}` : `Open ${getFieldText(entry, "title", isAr)}`}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Field detail view ─────────────────────────────────────────────────── */
  if (selected) {
    const group = groupOf(selected);
    const GroupIcon = GROUP_ICONS[group?.icon] || Compass;
    const siblings = CAREER_FIELDS.filter(
      (entry) => entry.category === selected.category && entry.id !== selected.id,
    );
    return (
      <div dir={dir} className="mx-auto w-full max-w-4xl animate-fade-up px-1">
        <button
          type="button"
          onClick={() => { setSelectedId(""); }
          }
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-secondary/50"
        >
          <BackArrow className="h-4 w-4" /> {isAr ? `كل مجالات ${group?.label[isAr ? 0 : 1] || ""}` : `Back to ${group?.label[isAr ? 1 : 0] || "all fields"}`}
        </button>

        <article className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          {/* Header banner */}
          <div className={`relative overflow-hidden bg-gradient-to-br ${group?.gradient || "from-zeus-gold/10 to-transparent"} p-6 sm:p-8`}>
            <div className="relative flex items-start gap-4">
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border/60 bg-background/70 shadow-sm ${group?.accent || "text-zeus-brightgold"}`}>
                <GroupIcon className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zeus-brightgold">
                  {isAr ? "دليل المسارات المهنية" : "Career guide"}
                </p>
                <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                  {getFieldText(selected, "title", isAr)}
                </h1>
              </div>
            </div>
            <p className="relative mt-4 max-w-2xl text-sm leading-7 text-foreground/85">{getFieldText(selected, "summary", isAr)}</p>
          </div>

          <div className="space-y-7 p-5 sm:p-8">
            {/* Overview */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <BookOpen className="h-4 w-4 text-zeus-brightgold" />
                  {isAr ? "نظرة عامة" : "Field overview"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "about", isAr)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Briefcase className="h-4 w-4 text-zeus-brightgold" />
                  {isAr ? "طبيعة الشغل" : "What the work looks like"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "work", isAr)}</p>
              </div>
            </section>

            {/* Roles */}
            <section>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Users className="h-4 w-4 text-zeus-brightgold" />
                {isAr ? "أشهر الوظائف" : "Common career roles"}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {getFieldText(selected, "roles", isAr).map((role) => (
                  <li key={role} className="rounded-full border border-border/70 bg-background/60 px-3.5 py-1.5 text-xs font-medium">{role}</li>
                ))}
              </ul>
            </section>

            {/* Skills + prerequisites */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="h-4 w-4 text-zeus-brightgold" />
                  {isAr ? "المهارات المطلوبة" : "Required skills"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "skills", isAr)}</p>
              </div>
              {group && (
                <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Target className="h-4 w-4 text-zeus-brightgold" />
                    {isAr ? "مستلزمات المبتدئ" : "Beginner prerequisites"}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{groupBasics(group, isAr)}</p>
                </div>
              )}
            </section>

            {/* Practical application */}
            <section className="rounded-2xl border border-zeus-gold/25 bg-zeus-gold/5 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-zeus-brightgold">
                <Trophy className="h-4 w-4" />
                {isAr ? "تطبيق عملي واضح" : "A practical application"}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "project", isAr)}</p>
            </section>

            {/* Roadmap */}
            {group && groupRoadmap(group, isAr).length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Compass className="h-4 w-4 text-zeus-brightgold" />
                  {isAr ? "خارطة الطريق التعليمية" : "Learning roadmap"}
                </h2>
                <ol className="mt-4 space-y-3">
                  {groupRoadmap(group, isAr).map((stepItem, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm leading-7 text-muted-foreground">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/70 bg-background/70 text-xs font-bold ${group.accent}`}>{i + 1}</span>
                      <span className="pt-0.5">{stepItem}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Opportunities */}
            {group && (
              <section className="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Rocket className="h-4 w-4 text-zeus-brightgold" />
                  {isAr ? "الفرص المهنية" : "Career opportunities"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{groupOpportunity(group, isAr)}</p>
              </section>
            )}

            {/* Sources + actions */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-bold">{isAr ? "للتعمّق أكثر" : "Further reading"}</h2>
                <ul className="mt-3 space-y-2">
                  {selected.sources.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition hover:bg-secondary/50 hover:text-zeus-brightgold"
                      >
                        <DetailArrow className="h-3.5 w-3.5 shrink-0" /> {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <Link
                  to="/app"
                  className="min-h-11 w-full items-center justify-center gap-2 rounded-full bg-zeus-gold px-5 text-sm font-semibold text-zeus-midnight transition hover:bg-zeus-brightgold shadow-gold inline-flex"
                >
                  <Rocket className="h-4 w-4" /> {isAr ? "ابدأ رحلتك مع ZEUS" : "Start learning with ZEUS"}
                </Link>
                <Link
                  to="/cv-builder"
                  className="min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border/70 px-5 text-sm font-semibold transition hover:border-zeus-gold/40 hover:bg-secondary/50 inline-flex"
                >
                  <FileText className="h-4 w-4" /> {isAr ? "جهّز سيرتك الذاتية" : "Prepare your CV"}
                </Link>
              </div>
            </section>

            {/* Related fields */}
            {siblings.length > 0 && (
              <section>
                <h2 className="text-sm font-bold">{isAr ? "مجالات مرتبطة" : "Related fields"}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {siblings.map((entry) => (
                    <div key={entry.id} className="flex overflow-hidden rounded-full border border-border/70">
                      <button type="button" onClick={() => setSelectedId(entry.id)} className="px-3.5 py-1.5 text-xs font-medium transition hover:bg-secondary/50">
                        {getFieldText(entry, "title", isAr)}
                      </button>
                      <button
                        type="button"
                        title={isAr ? "أضف للمقارنة" : "Add to comparison"}
                        onClick={() => toggleCompare(entry.id)}
                        className="grid place-items-center border-s border-border/60 px-2 text-muted-foreground transition hover:text-zeus-brightgold"
                      >
                        <GitCompare className={`h-3.5 w-3.5 ${compareIds.includes(entry.id) ? "text-zeus-brightgold" : ""}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </article>
      </div>
    );
  }

  /* ── Browse/landing view: hero → categories → fields grid ─────────────── */
  return (
    <div dir={dir} className="space-y-10 px-1">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-zeus-gold/12 via-fuchsia-500/6 to-transparent p-6 sm:p-10 animate-fade-up">
        <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 h-64 w-64 rounded-full bg-zeus-gold/10 blur-3xl" />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-zeus-gold/30 bg-background/70 px-3 py-1 text-[11px] font-bold text-zeus-brightgold">
              <Compass className="h-3.5 w-3.5" />
              {isAr ? "دليل المسارات المهنية" : "Career guide"}
            </p>
            <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">
              {isAr
                ? "اختار مجالك بفهم واضح، مش بالتخمين"
                : "Choose your career with clarity — not guesswork"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              {isAr
                ? "استكشف 8 مجالات رئيسية — من الذكاء الاصطناعي للريادة: كل مجال فيه طبيعة الشغل، الوظائف، المهارات، المطلوب من المبتدئ، وخارطة طريق تتعلمها خطوة بخطوة. قارن بين المجالات جنبًا لجنب قبل ما تحدد."
                : "Explore 8 major fields — from AI to entrepreneurship: what each one actually involves, its roles and skills, beginner prerequisites, and a step-by-step learning roadmap. Compare them side by side before you commit."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => document.getElementById("categories-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-zeus-gold px-6 text-sm font-bold text-zeus-midnight transition hover:bg-zeus-brightgold shadow-gold"
              >
                <Sparkles className="h-4 w-4" />
                {isAr ? "ابدأ الاستكشاف" : "Start exploring"}
              </button>
              <Link
                to="/career"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-6 text-sm font-semibold transition hover:bg-secondary/50"
              >
                <Briefcase className="h-4 w-4" />
                {isAr ? "مسارك المهني" : "Career hub"}
              </Link>
            </div>
          </div>
          {/* Decorative constellation of field icons — no external assets */}
          <div aria-hidden="true" className="relative hidden shrink-0 lg:block">
            <div className="grid grid-cols-2 gap-3">
              {CAREER_GROUPS.slice(0, 4).map((group, i) => {
                const Icon = GROUP_ICONS[group.icon] || Compass;
                return (
                  <button key={group.id} type="button" onClick={() => openGroup(group.id)}
                    className={`grid h-16 w-16 place-items-center rounded-2xl border border-border/60 bg-background/70 shadow-sm ${group.accent} transition hover:scale-105`}
                    style={{ transform: i % 2 ? "translateY(-10px)" : undefined }}>
                    <Icon className="h-7 w-7" />
                  </button>
                );
              })}
            </div>
            <div className="absolute -bottom-3 -left-3 grid grid-cols-2 gap-3">
              {CAREER_GROUPS.slice(4, 8).map((group) => {
                const Icon = GROUP_ICONS[group.icon] || Compass;
                return (
                  <button key={group.id} type="button" onClick={() => openGroup(group.id)}
                    className={`grid h-12 w-12 place-items-center rounded-xl border border-border/60 bg-background/70 ${group.accent} transition hover:scale-105`}>
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Category cards (8 major fields) ── */}
      <section id="categories-anchor" className="scroll-mt-24">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-bold sm:text-2xl">{isAr ? "المجالات الرئيسية" : "Career categories"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr ? "اختار مجال لاستكشاف تفاصيله، أو المقارنة بين أكثر من واحد." : "Pick a field to explore its details — or compare several."}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAREER_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.icon] || Compass;
            const fieldsInGroup = CAREER_FIELDS.filter((entry) => group.categories.includes(entry.category));
            return (
              <article
                key={group.id}
                className={`group relative flex min-h-52 flex-col overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br ${group.gradient} p-5 transition hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring animate-fade-up`}
              >
                <span className={`grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-background/70 shadow-sm ${group.accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-base font-bold">{group.label[isAr ? 0 : 1]}</h3>
                <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{group.description[isAr ? 0 : 1]}</p>
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  {isAr ? `${fieldsInGroup.length} تخصص داخله` : `${fieldsInGroup.length} specializations`}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openGroup(group.id)}
                    className={`inline-flex min-h-9 items-center gap-1 rounded-full bg-background/70 px-3.5 text-xs font-bold ${group.accent} border border-border/60 transition hover:bg-background`}
                  >
                    {isAr ? "استكشف المجال" : "Explore"}
                    <DetailArrow className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    aria-pressed={compareIds.includes(fieldsInGroup[0]?.id)}
                    title={isAr ? "أضف للمقارنة" : "Add to comparison"}
                    onClick={() => toggleCompare(fieldsInGroup[0]?.id)}
                    className={`grid h-9 w-9 place-items-center rounded-full border transition ${
                      compareIds.includes(fieldsInGroup[0]?.id)
                        ? "border-zeus-brightgold/60 bg-zeus-brightgold/15 text-zeus-brightgold"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <GitCompare className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Specializations grid ── */}
      <section id="fields-anchor" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-bold sm:text-2xl">
            {activeGroup
              ? CAREER_GROUPS.find((item) => item.id === activeGroup)?.label[isAr ? 0 : 1]
              : (isAr ? "كل التخصصات" : "All specializations")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {isAr ? `اختار حتى 3 للمقارنة (${compareIds.length}/3)` : `Pick up to 3 to compare (${compareIds.length}/3)`}
          </span>
        </div>

        {/* Search + group chips */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-ring/40">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isAr ? "ابحث: برمجة، بيانات، تصميم، تسويق..." : "Search: coding, data, design, marketing..."}
              aria-label={isAr ? "ابحث في المجالات" : "Search career fields"}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground" aria-label={isAr ? "مسح البحث" : "Clear search"}>
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setActiveGroup(""); }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${!activeGroup ? "border-zeus-gold/50 bg-zeus-gold/10 text-zeus-brightgold" : "border-border/70 text-muted-foreground hover:bg-secondary/50"}`}
            >
              {isAr ? "كل المجالات" : "All fields"}
            </button>
            {CAREER_GROUPS.map((group) => (
              <button
                type="button"
                key={group.id}
                onClick={() => { setActiveGroup(activeGroup === group.id ? "" : group.id); }}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${activeGroup === group.id ? "border-zeus-gold/50 bg-zeus-gold/10 text-zeus-brightgold" : "border-border/70 text-muted-foreground hover:bg-secondary/50"}`}
              >
                {group.label[isAr ? 0 : 1]}
              </button>
            ))}
          </div>
        </div>

        {filteredFields.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFields.map((entry) => {
              const group = groupOf(entry);
              const inCompare = compareIds.includes(entry.id);
              return (
                <div key={entry.id} className="group relative min-h-36 rounded-2xl border border-border/70 bg-card p-4 transition hover:border-foreground/30 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setSelectedId(entry.id)} className="min-w-0 flex-1 text-start">
                      <span className="flex items-center gap-2 text-base font-semibold">
                        {getFieldText(entry, "title", isAr)}
                        {group && <span className={`hidden rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium ${group.accent} sm:inline`}>{group.label[isAr ? 0 : 1]}</span>}
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-sm leading-6 text-muted-foreground">{getFieldText(entry, "summary", isAr)}</span>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition group-hover:text-foreground">
                        {isAr ? "اقرأ التفاصيل" : "Read details"} <DetailArrow className="h-3.5 w-3.5" />
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={inCompare}
                      title={isAr ? "أضف للمقارنة" : "Add to comparison"}
                      onClick={() => toggleCompare(entry.id)}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition ${inCompare ? "border-zeus-brightgold/60 bg-zeus-brightgold/15 text-zeus-brightgold" : "border-border/70 text-muted-foreground hover:text-foreground"}`}
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
            {isAr ? "مفيش مجال بالاسم ده. جرّب كلمة تانية." : "No field found. Try another search."}
          </p>
        )}
      </section>

      {/* Sticky compare bar */}
      {compareIds.length >= 2 && !comparing && (
        <div className="sticky bottom-4 z-20">
          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-zeus-gold/30 bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <GitCompare className="h-3.5 w-3.5 text-zeus-brightgold" />
              {compareFields.map((entry) => getFieldText(entry, "title", isAr)).join(isAr ? " و " : " · ")}
            </span>
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-zeus-gold px-4 text-xs font-bold text-zeus-midnight transition hover:bg-zeus-brightgold"
            >
              {isAr ? "قارن دلوقتي" : "Compare now"}
            </button>
            <button
              type="button"
              onClick={() => { setCompareIds([]); setComparing(false); }}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border/70 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> {isAr ? "مسح" : "Clear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
