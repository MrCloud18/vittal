import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaletteColors, RoleKey, paletteFor } from './tokens';

type ThemeMode = 'light' | 'dark' | 'system';

type Theme = {
  mode: ThemeMode;
  isDark: boolean;
  role: RoleKey;
  colors: PaletteColors;
  setMode: (mode: ThemeMode) => void;
  setRole: (role: RoleKey) => void;
};

const STORAGE_KEY = 'vittal_theme_mode';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [role, setRole] = useState<RoleKey>('neutral');
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const palette = paletteFor(role);
  const colors = isDark ? palette.dark : palette.light;

  const value = useMemo<Theme>(
    () => ({ mode, isDark, role, colors, setMode, setRole }),
    [mode, isDark, systemScheme, role, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('ThemeProvider missing');
  return ctx;
}
