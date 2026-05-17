import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type TranslatorLifecycleContextValue = {
  registerTranslatorStop: (fn: (() => Promise<void>) | null) => void;
  stopTranslatorSession: () => Promise<void>;
};

const TranslatorLifecycleContext = createContext<TranslatorLifecycleContextValue | undefined>(
  undefined,
);

export function TranslatorLifecycleProvider({ children }: { children: React.ReactNode }) {
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  const registerTranslatorStop = useCallback((fn: (() => Promise<void>) | null) => {
    stopRef.current = fn;
  }, []);

  const stopTranslatorSession = useCallback(async () => {
    try {
      await stopRef.current?.();
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ registerTranslatorStop, stopTranslatorSession }),
    [registerTranslatorStop, stopTranslatorSession],
  );

  return (
    <TranslatorLifecycleContext.Provider value={value}>{children}</TranslatorLifecycleContext.Provider>
  );
}

export function useTranslatorLifecycle(): TranslatorLifecycleContextValue {
  const ctx = useContext(TranslatorLifecycleContext);
  if (!ctx) {
    throw new Error('useTranslatorLifecycle must be used within TranslatorLifecycleProvider');
  }
  return ctx;
}
