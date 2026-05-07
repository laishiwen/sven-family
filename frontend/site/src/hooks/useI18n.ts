'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribe, t, type Locale } from '@/lib/i18n';

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const messages = t();

  const changeLocale = (next: Locale) => {
    setLocale(next);
  };

  return { locale, t: messages, setLocale: changeLocale };
}
