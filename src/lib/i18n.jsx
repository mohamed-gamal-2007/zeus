import React, { createContext, useContext, useState, useEffect } from 'react';

export const LOCALES = Object.freeze(['en', 'ar']);

export const I18nContext = createContext();

export const ENGLISH = Object.freeze({
  brand: 'ZEUS — Your personalized learning journey',
  landing: Object.freeze({
    community: Object.freeze({ title: 'Smart Community', titleAr: 'مجتمع ذكي' }),
    career: Object.freeze({ title: 'Learning to Career', titleAr: 'من التعلّم للشغل' }),
    cta: Object.freeze({ start: 'Start now', startAr: 'ابدأ الآن', how: 'How it works', howAr: 'إزاي بيشتغل' }),
  }),
  onboarding: Object.freeze({
    discovery: Object.freeze({ title: 'Discover Yourself', titleAr: 'اكتشف نفسك' }),
  }),
  // Step indicator labels used in the onboarding progress bar
  onb: Object.freeze({
    discover: Object.freeze({ title: 'Chat & Explore' }),
    dna: Object.freeze({ title: 'Your Profile' }),
    goal: Object.freeze({ title: 'Choose Path' }),
    assess: Object.freeze({ title: 'Skill Check' }),
    roadmap: Object.freeze({ title: 'Your Roadmap' }),
    name: Object.freeze({ default: 'Zeus' }),
  }),
  companion: Object.freeze({ placeholder: 'Enter your question...' }),
  settings: Object.freeze({ nav: 'Settings', save: 'Save' }),
  nav: Object.freeze({
    logout: 'Log out', home: 'Home', schedule: 'Schedule', progress: 'Progress',
    subscriptions: 'Subscriptions', certificates: 'Certificates', community: 'Community',
    career: 'Career', settings: 'Settings',
  }),
  learn: Object.freeze({ title: 'Learn', titleAr: 'التعلّم' }),
  progress: Object.freeze({ title: 'Progress', titleAr: 'تقدّمي' }),
  community: Object.freeze({ title: 'ZEUS Community', titleAr: 'مجتمع ZEUS' }),
  projects: Object.freeze({ title: 'Projects', titleAr: 'مشاريعي' }),
  career: Object.freeze({ title: 'Career', titleAr: 'المسار المهني' }),
  certificates: Object.freeze({ title: 'Certificates', titleAr: 'شهاداتي' }),
  profile: Object.freeze({ title: 'Profile', titleAr: 'ملفي الشخصي' }),
  subscriptions: Object.freeze({ title: 'Subscriptions', titleAr: 'اشتراكي' }),
  discover: Object.freeze({ title: 'Discover', titleAr: 'اكتشاف' }),
  roadmap: Object.freeze({ title: 'Roadmap', titleAr: 'خريطتي' }),
  schedule: Object.freeze({ title: 'Schedule', titleAr: 'الخطة' }),
  lesson: Object.freeze({ title: 'Lesson', titleAr: 'الدرس' }),
  start: Object.freeze({ title: 'Start your journey', titleAr: 'ابدأ رحلتك' }),
});

export const ARABIC = Object.freeze({
  brand: 'ZEUS — رحلتك في التعلّم، مصمّمة حولك',
  landing: Object.freeze({
    community: Object.freeze({ title: 'مجتمع ذكي', titleEn: 'Smart Community' }),
    career: Object.freeze({ title: 'من التعلّم للشغل', titleEn: 'Learning to Career' }),
    cta: Object.freeze({ start: 'ابدأ الآن', startEn: 'Start now', how: 'إزاي بيشتغل', howEn: 'How it works' }),
  }),
  onboarding: Object.freeze({
    discovery: Object.freeze({ title: 'اكتشف نفسك', titleEn: 'Discover Yourself' }),
  }),
  // Step indicator labels used in the onboarding progress bar
  onb: Object.freeze({
    discover: Object.freeze({ title: 'الاستكشاف' }),
    dna: Object.freeze({ title: 'ملفك' }),
    goal: Object.freeze({ title: 'اختر مسارك' }),
    assess: Object.freeze({ title: 'مهاراتك' }),
    roadmap: Object.freeze({ title: 'خريطتك' }),
    name: Object.freeze({ default: 'Zeus' }),
  }),
  companion: Object.freeze({ placeholder: 'اكتب سؤالك...' }),
  settings: Object.freeze({ nav: 'الإعدادات', save: 'حفظ' }),
  nav: Object.freeze({
    logout: 'تسجيل الخروج', home: 'الرئيسية', schedule: 'الخطة والدروس', progress: 'الإحصائيات',
    subscriptions: 'الاشتراكات', certificates: 'الشهادات', community: 'المجتمع',
    career: 'المسار المهني', settings: 'الإعدادات',
  }),
  learn: Object.freeze({ title: 'التعلّم', titleEn: 'Learn' }),
  progress: Object.freeze({ title: 'تقدّمي', titleEn: 'Progress' }),
  community: Object.freeze({ title: 'مجتمع ZEUS', titleEn: 'ZEUS Community' }),
  projects: Object.freeze({ title: 'مشاريعي', titleEn: 'Projects' }),
  career: Object.freeze({ title: 'المسار المهني', titleEn: 'Career' }),
  certificates: Object.freeze({ title: 'شهاداتي', titleEn: 'Certificates' }),
  profile: Object.freeze({ title: 'ملفي الشخصي', titleEn: 'Profile' }),
  subscriptions: Object.freeze({ title: 'اشتراكي', titleEn: 'Subscriptions' }),
  discover: Object.freeze({ title: 'اكتشاف', titleEn: 'Discover' }),
  roadmap: Object.freeze({ title: 'خريطتي', titleEn: 'Roadmap' }),
  schedule: Object.freeze({ title: 'الخطة', titleEn: 'Schedule' }),
  lesson: Object.freeze({ title: 'الدرس', titleEn: 'Lesson' }),
  start: Object.freeze({ title: 'ابدأ رحلتك', titleEn: 'Start your journey' }),
});

function loadFromLocalStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored);
    return fallback;
  } catch {
    return fallback;
  }
}

function persistToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write failures
  }
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const stored = loadFromLocalStorage('zeus_lang', null);
    if (stored && LOCALES.includes(stored)) return stored;
    return 'en';
  });

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const t = (key, fallback = key) => {
    if (!locale) return fallback;
    const parts = key.split('.');
    let node = locale === 'ar' ? ARABIC : ENGLISH;
    for (const part of parts) {
      if (node && typeof node === 'object' && part in node) {
        node = node[part];
      } else {
        node = null;
        break;
      }
    }
    if (node && typeof node === 'string') return node;
    if (node && typeof node === 'object') {
      if (node.title && Object.prototype.hasOwnProperty.call(node, 'title')) return node.title;
      return fallback;
    }
    return fallback;
  };

  const setLang = (next) => {
    if (!LOCALES.includes(next)) return;
    setLocale(next);
    persistToLocalStorage('zeus_lang', next);
  };

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale);
  }, [locale, dir]);

  // Expose both `locale`/`setLocale` and `lang`/`dir` aliases: most consumers
  // destructure `{ lang, dir }` from useI18n(), so the context must provide them
  // or language switching has no visible effect (lang/dir would be undefined).
  const value = { locale, lang: locale, dir, setLocale, setLang, t };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
