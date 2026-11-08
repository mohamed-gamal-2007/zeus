import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { I18nProvider, useI18n } from "./i18n";

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

describe("I18nProvider — context shape", () => {
  it("defaults to English (locale/lang = en, dir = ltr)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en");
    expect(result.current.lang).toBe("en");
    expect(result.current.dir).toBe("ltr");
  });

  it("exposes `lang` and `dir` aliases (the names most consumers destructure)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.lang).toBe(result.current.locale);
    expect(["ltr", "rtl"]).toContain(result.current.dir);
  });

  it("provides setLocale, setLang and t as functions", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(typeof result.current.setLang).toBe("function");
    expect(typeof result.current.setLocale).toBe("function");
    expect(typeof result.current.t).toBe("function");
  });
});

describe("I18nProvider — setLang", () => {
  it("switches to Arabic and persists the choice", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang("ar"));
    expect(result.current.locale).toBe("ar");
    expect(result.current.lang).toBe("ar");
    expect(result.current.dir).toBe("rtl");
    expect(JSON.parse(localStorage.getItem("zeus_lang"))).toBe("ar");
  });

  it("ignores invalid locales", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang("fr"));
    expect(result.current.locale).toBe("en");
    expect(JSON.parse(localStorage.getItem("zeus_lang"))).toBeNull();
  });

  it("restores the saved language on mount", () => {
    localStorage.setItem("zeus_lang", JSON.stringify("ar"));
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("ar");
    expect(result.current.dir).toBe("rtl");
  });

  it("writes <html dir> and <html lang> to match the locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang("ar"));
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });
});

describe("I18nProvider — t()", () => {
  it("resolves leaf keys for English", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("nav.settings")).toBe("Settings");
    expect(result.current.t("nav.logout")).toBe("Log out");
    expect(result.current.t("landing.cta.start")).toBe("Start now");
  });

  it("resolves leaf keys for Arabic", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang("ar"));
    expect(result.current.t("nav.settings")).toBe("الإعدادات");
    expect(result.current.t("nav.logout")).toBe("تسجيل الخروج");
    expect(result.current.t("landing.cta.start")).toBe("ابدأ الآن");
  });

  it("returns the fallback for missing keys", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("no.such.key")).toBe("no.such.key");
    expect(result.current.t("no.such.key", "Fallback")).toBe("Fallback");
  });

  it("returns the node's own title for the current locale (not the opposite language)", () => {
    // landing.community is a node { title, titleAr/titleEn } — t() must return
    // the current locale's `title`, never the cross-language hint.
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("landing.community")).toBe("Smart Community");
    act(() => result.current.setLang("ar"));
    expect(result.current.t("landing.community")).toBe("مجتمع ذكي");
  });
});
