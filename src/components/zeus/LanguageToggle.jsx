import React from "react";
import { useI18n } from "@/lib/i18n";

export default function LanguageToggle({ className = "" }) {
  const { locale, setLang, t } = useI18n();
  const isAr = locale === "ar";
  return (
    <button
      onClick={() => setLang(isAr ? "en" : "ar")}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-card/50 hover:bg-secondary/60 hover:zeus-gold-border transition ${className}`}
      type="button"
      aria-label={t("common.switchLanguage", isAr ? "Switch language to English" : "تغيير اللغة إلى العربية")}
    >
      <span lang={isAr ? "en" : "ar"}>{isAr ? t("common.english", "English") : t("common.arabic", "العربية")}</span>
    </button>
  );
}
