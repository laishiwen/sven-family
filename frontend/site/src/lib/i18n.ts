import { zh } from '@/i18n/locales/zh';
import { en } from '@/i18n/locales/en';

export type Locale = 'zh' | 'en';
export type LocaleMessages = typeof zh;

const messages: Record<Locale, LocaleMessages> = { zh, en };

let currentLocale: Locale = 'zh';

const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sven-locale', locale);
  }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(): LocaleMessages {
  return messages[currentLocale];
}

export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  const stored = localStorage.getItem('sven-locale');
  if (stored === 'en' || stored === 'zh') return stored;
  const navLang = navigator.language.toLowerCase();
  return navLang.startsWith('zh') ? 'zh' : 'en';
}
