import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, ChartBar, Check, ChevronLeft, ChevronRight,
  Code2, Compass, GitCompare, LayoutTemplate, Megaphone, Palette, Rocket, Scale,
  Search, Shield, Sparkles, X,
} from "lucide-react";
import {
  CAREER_FIELDS, CAREER_GROUPS, getFieldSearchTerms, getFieldText,
} from "@/data/careerFields";

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

/** CAREER_GROUPS store `["ar ...", "en ..."]` pairs — a different shape from
 * the fine fields' `{ar, en}` getters. */
const groupBasics = (group, isAr) => group?.basics?.[0]?.[isAr ? 0 : 1] || "";
const groupOpportunity = (group, isAr) => group?.opportunity?.[0]?.[isAr ? 0 : 1] || "";
const groupRoadmap = (group, isAr) => (group?.roadmap || []).map((pair) => (isAr ? pair?.[0] : pair?.[1]));



export default function CareerFieldExplorer({
  isAr,
  onBack,
  onChoose,
  source = "discovery",
  query,
  onQueryChange,
  selectedId,
  onSelectedChange,
}) {
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const DetailArrow = isAr ? ChevronLeft : ChevronRight;
  const [activeGroup, setActiveGroup] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [comparing, setComparing] = useState(false);

  const selected = CAREER_FIELDS.find((entry) => entry.id === selectedId);

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

  const choose = (entry) => onChoose?.(entry.title[isAr ? "ar" : "en"]);

  /* ── Comparison view ─────────────────────────────────────────────────── */
  if (comparing && compareFields.length >= 2) {
    return (
      <section className="mx-auto w-full max-w-6xl animate-fade-up" dir={isAr ? "rtl" : "ltr"}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setComparing(false)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm font-medium hover:bg-secondary/50"
          >
            <BackArrow className="h-4 w-4" /> {isAr ? "رجوع للاستكشاف" : "Back to exploring"}
          </button>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Scale className="h-5 w-5 text-zeus-brightgold" />
            {isAr ? "مقارنة بين المجالات" : "Comparing fields"}
          </h2>
          <span className="text-xs text-muted-foreground">{compareFields.length} / 3</span>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-border/70 bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-start">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/30">
                <th className="p-4 text-start text-xs font-medium text-muted-foreground" aria-label={isAr ? "خاصية" : "Attribute"} />
                {compareFields.map((entry) => (
                  <th key={entry.id} className="min-w-52 p-4 text-start">
                    <button
                      type="button"
                      onClick={() => onSelectedChange(entry.id)}
                      className="block text-base font-bold hover:underline"
                    >
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
                ["summary", isAr ? "الملخص" : "Summary"],
                ["about", isAr ? "المجال معناه إيه" : "What it is"],
                ["work", isAr ? "الشغل شكله إيه" : "What the work looks like"],
                ["roles", isAr ? "وظائف" : "Roles"],
                ["skills", isAr ? "المهارات" : "Skills"],
                ["project", isAr ? "مثال مشروع" : "Project example"],
              ].map(([key, label]) => (
                <tr key={key}>
                  <th scope="row" className="w-28 align-top p-4 text-xs font-semibold text-muted-foreground">{label}</th>
                  {compareFields.map((entry) => (
                    <td key={entry.id} className="align-top p-4 text-sm leading-7 text-muted-foreground">
                      {key === "roles"
                        ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {getFieldText(entry, "roles", isAr).map((role) => (
                              <li key={role} className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-foreground">{role}</li>
                            ))}
                          </ul>
                        )
                        : getFieldText(entry, key, isAr)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {source === "goal" && (
          <button
            type="button"
            onClick={() => choose(compareFields[0])}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-foreground/20 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90"
          >
            <Check className="h-4 w-4" />
            {isAr
              ? `اختار ${getFieldText(compareFields[0], "title", isAr)}`
              : `Choose ${getFieldText(compareFields[0], "title", isAr)}`}
          </button>
        )}
      </section>
    );
  }

  /* ── Field detail view ───────────────────────────────────────────────── */
  if (selected) {
    const group = CAREER_GROUPS.find((item) => item.categories.includes(selected.category));
    const GroupIcon = GROUP_ICONS[group?.icon] || Compass;
    return (
      <section className="mx-auto w-full max-w-6xl animate-fade-up" dir={isAr ? "rtl" : "ltr"}>
        <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <button type="button" onClick={() => onSelectedChange("")} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm font-medium hover:bg-secondary/50">
            <BackArrow className="h-4 w-4" /> {isAr ? "كل المجالات" : "All fields"}
          </button>
          <span className="text-xs text-muted-foreground">{isAr ? "دليل المجالات" : "Career field guide"}</span>
        </header>

        <div className="mx-auto max-w-3xl px-1 pb-8">
          <article className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
            <div className={`bg-gradient-to-br ${group?.gradient || "from-zeus-gold/10 to-transparent"} p-6 sm:p-8`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/60 ${group?.accent || "text-zeus-brightgold"}`}>
                    <GroupIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{isAr ? group?.label[1] : group?.label[0]}</p>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{getFieldText(selected, "title", isAr)}</h1>
                  </div>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/80">{getFieldText(selected, "summary", isAr)}</p>
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-zeus-brightgold" />
                    {isAr ? "الشغل فيه" : "What the work looks like"}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "work", isAr)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-zeus-brightgold" />
                    {isAr ? "المجال معناه إيه" : "What this field is"}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "about", isAr)}</p>
                </div>
              </div>

              <section>
                <h3 className="text-base font-semibold">{isAr ? "وظائف ممكن تشتغلها" : "Possible roles"}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {getFieldText(selected, "roles", isAr).map((role) => (
                    <li key={role} className="rounded-full border border-border/70 px-3 py-1.5 text-xs">{role}</li>
                  ))}
                </ul>
              </section>

              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <h3 className="text-sm font-bold">{isAr ? "مثال مشروع بالتفصيل" : "A project example"}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "project", isAr)}</p>
                </section>
                <section className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <h3 className="text-sm font-bold">{isAr ? "إيه اللي هتتعلمه" : "What you will learn"}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "skills", isAr)}</p>
                </section>
              </div>

              {group && (
                <>
                  <section className="rounded-2xl border border-border/70 p-4 sm:p-5">
                    <h3 className="text-base font-semibold">{isAr ? "مطلوب من المبتدئ إيه" : "Beginner prerequisites"}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{groupBasics(group, isAr)}</p>
                  </section>
                  <section className="rounded-2xl border border-border/70 p-4 sm:p-5">
                    <h3 className="text-base font-semibold">{isAr ? "خارطة الطريق العملية" : "Practical learning roadmap"}</h3>
                    <ol className="mt-3 space-y-3">
                      {groupRoadmap(group, isAr).map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm leading-7 text-muted-foreground">
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border/70 text-xs font-bold ${group.accent}`}>{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section className="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
                    <h3 className="text-base font-semibold">{isAr ? "الفرص بتنمو إزاي" : "How careers grow"}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{groupOpportunity(group, isAr)}</p>
                  </section>
                </>
              )}

              <section>
                <h3 className="text-base font-semibold">{isAr ? "مصادر للقراءة والتعمّق" : "Further reading"}</h3>
                <ul className="mt-2 space-y-2">
                  {selected.sources.map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                        {link.title}<DetailArrow className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              {source === "goal" ? (
                <button type="button" onClick={() => choose(selected)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90">
                  <Check className="h-4 w-4" />
                  {isAr ? "اختار المجال ده" : "Choose this field"}
                </button>
              ) : (
                <button type="button" onClick={onBack} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border/70 px-5 text-sm font-semibold text-foreground transition hover:bg-secondary/50">
                  <BackArrow className="h-4 w-4" />
                  {isAr ? "خلصت قراءة؟ ارجع للمحادثة" : "Done reading? Return to chat"}
                </button>
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  /* ── Browse view: hero + groups + search + chips + fine fields ───────── */
  return (
    <section className="mx-auto w-full max-w-6xl animate-fade-up" dir={isAr ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm font-medium hover:bg-secondary/50">
          <BackArrow className="h-4 w-4" />
          {isAr ? (source === "goal" ? "العودة لاختيار المسار" : "العودة للمحادثة") : (source === "goal" ? "Back to path selection" : "Back to conversation")}
        </button>
        <span className="text-xs text-muted-foreground">{isAr ? "دليل المجالات" : "Career field guide"}</span>
      </header>

      {/* Hero */}
      <div className={`relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-zeus-gold/10 via-fuchsia-500/5 to-transparent p-6 sm:p-10`}>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] font-semibold text-zeus-brightgold">
              <Compass className="h-3.5 w-3.5" />
              {isAr ? "دليل المسارات المهنية" : "Career explorer"}
            </p>
            <h1 className="mt-3 font-heading text-2xl font-bold tracking-tight sm:text-4xl">
              {isAr ? "اختار مجالك بفهم مش بالمحاولة" : "Choose your field with clarity, not guesswork"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              {isAr
                ? "استكشف 8 مجالات رئيسية من الذكاء الاصطناعي للريادة: كل واحد فيه طبيعة الشغل والوظائف والمهارات وخارطة طريق تتعلمها خطوة بخطوة — وقارن بين المجالات على حدة قبل ما تحدد."
                : "Explore 8 major fields from AI to entrepreneurship: what each involves, its roles, skills, and a step-by-step learning roadmap — and compare them side by side before deciding."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => document.getElementById("field-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/20 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" />
                {isAr ? "ابدأ الاستكشاف" : "Start exploring"}
              </button>
              {compareIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setComparing(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/70 bg-background px-5 text-sm font-semibold transition hover:bg-secondary/50"
                >
                  <GitCompare className="h-4 w-4" />
                  {isAr ? `قارن ${compareIds.length} مجالات` : `Compare ${compareIds.length} fields`}
                </button>
              )}
            </div>
          </div>
          {/* Decorative illustration: icon constellation, no external assets */}
          <div aria-hidden="true" className="relative hidden shrink-0 sm:block">
            <div className="grid grid-cols-2 gap-3">
              {CAREER_GROUPS.slice(0, 4).map((group) => {
                const Icon = GROUP_ICONS[group.icon] || Compass;
                return (
                  <span key={group.id} className={`grid h-16 w-16 place-items-center rounded-2xl border border-border/60 bg-background/70 shadow-sm ${group.accent}`}>
                    <Icon className="h-7 w-7" />
                  </span>
                );
              })}
            </div>
            <div className="absolute -bottom-3 -left-3 grid grid-cols-2 gap-3 opacity-90">
              {CAREER_GROUPS.slice(4, 8).map((group) => {
                const Icon = GROUP_ICONS[group.icon] || Compass;
                return (
                  <span key={group.id} className={`grid h-12 w-12 place-items-center rounded-xl border border-border/60 bg-background/70 ${group.accent}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Search + group chips */}
      <div className="mt-6 space-y-3">
        <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={isAr ? "ابحث: برمجة، بيانات، تصميم، تسويق..." : "Search: coding, data, design, marketing..."}
            aria-label={isAr ? "ابحث في المجالات" : "Search career fields"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setActiveGroup(""); onSelectedChange(""); }}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${!activeGroup ? "border-foreground/30 bg-secondary text-foreground" : "border-border/70 text-muted-foreground hover:bg-secondary/50"}`}
          >
            {isAr ? "كل المجالات" : "All fields"}
          </button>
          {CAREER_GROUPS.map((group) => (
            <button
              type="button"
              key={group.id}
              onClick={() => { setActiveGroup(activeGroup === group.id ? "" : group.id); onSelectedChange(""); }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${activeGroup === group.id ? "border-foreground/30 bg-secondary text-foreground" : "border-border/70 text-muted-foreground hover:bg-secondary/50"}`}
            >
              {group.label[isAr ? 0 : 1]}
            </button>
          ))}
        </div>
      </div>

      {/* Group cards */}
      {!query.trim() && !activeGroup && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-bold sm:text-xl">{isAr ? "المجالات الرئيسية" : "Major fields"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAREER_GROUPS.map((group) => {
              const Icon = GROUP_ICONS[group.icon] || Compass;
              return (
                <button
                  type="button"
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  className={`group relative min-h-44 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br ${group.gradient} p-5 text-start transition hover:border-foreground/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-background/70 ${group.accent}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block text-base font-bold">{group.label[isAr ? 0 : 1]}</span>
                  <span className="mt-1.5 block text-sm leading-6 text-muted-foreground">{group.description[isAr ? 0 : 1]}</span>
                  <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${group.accent}`}>
                    {isAr ? "استكشف المجال" : "Explore"}
                    <DetailArrow className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fine fields grid */}
      <div id="field-grid" className="mt-8 scroll-mt-24">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold sm:text-xl">
            {(activeGroup ? CAREER_GROUPS.find((item) => item.id === activeGroup)?.label[isAr ? 0 : 1] : (isAr ? "كل التخصصات" : "All specializations"))}
          </h2>
          <span className="text-xs text-muted-foreground">{isAr ? `اختار حتى 3 للمقارنة (${compareIds.length}/3)` : `Pick up to 3 to compare (${compareIds.length}/3)`}</span>
        </div>

        {filteredFields.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFields.map((entry) => {
              const inCompare = compareIds.includes(entry.id);
              return (
                <div
                  key={entry.id}
                  className="group relative min-h-32 rounded-2xl border border-border/70 bg-card p-4 text-start transition hover:border-foreground/30 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectedChange(entry.id)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <span className="mt-0 flex items-center justify-between gap-2 text-base font-semibold">
                        {getFieldText(entry, "title", isAr)}
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
          <p className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
            {isAr ? "مفيش مجال بالاسم ده. جرّب كلمة تانية." : "No field found. Try another search."}
          </p>
        )}
      </div>

      {/* Sticky compare bar */}
      {compareIds.length >= 2 && !comparing && (
        <div className="sticky bottom-4 z-20 mt-6">
          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <GitCompare className="h-3.5 w-3.5 text-zeus-brightgold" />
              {compareFields.map((entry) => getFieldText(entry, "title", isAr)).join(isAr ? " و " : " · ")}
            </span>
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90"
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
    </section>
  );
}
