import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ColorSchemeName, useColorScheme } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

type ThemeColors = {
  background: string;
  backgroundAccent: string;
  border: string;
  card: string;
  mutedText: string;
  navBackground: string;
  navBorder: string;
  primary: string;
  primaryPressed: string;
  text: string;
};

type ThemeContextValue = {
  colors: ThemeColors;
  effectiveScheme: "light" | "dark";
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  statusBarStyle: "light" | "dark";
};

const themePreferenceKey = "patrol360.themePreference";

const lightColors: ThemeColors = {
  background: "#f5f7fa",
  backgroundAccent: "#eaf2ff",
  border: "#e5e7eb",
  card: "#ffffff",
  mutedText: "#6b7280",
  navBackground: "#ffffff",
  navBorder: "#dbe5f2",
  primary: "#1e5bff",
  primaryPressed: "#1552e8",
  text: "#0f1a2b"
};

const darkColors: ThemeColors = {
  background: "#071426",
  backgroundAccent: "#0b2342",
  border: "#22324a",
  card: "#0f1f35",
  mutedText: "#b6c2d2",
  navBackground: "#0d1d33",
  navBorder: "#22324a",
  primary: "#4b7cff",
  primaryPressed: "#2f63f3",
  text: "#f5f7fa"
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let isMounted = true;
    void SecureStore.getItemAsync(themePreferenceKey).then((stored) => {
      if (!isMounted) {
        return;
      }

      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const effectiveScheme = resolveScheme(preference, systemScheme);
  const colors = effectiveScheme === "dark" ? darkColors : lightColors;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => null);
  }, [colors.background]);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await SecureStore.setItemAsync(themePreferenceKey, nextPreference);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      effectiveScheme,
      preference,
      setPreference,
      statusBarStyle: effectiveScheme === "dark" ? "light" : "dark"
    }),
    [colors, effectiveScheme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useAppTheme must be used inside ThemeProvider");
  }

  return value;
}

function resolveScheme(preference: ThemePreference, systemScheme: ColorSchemeName): "light" | "dark" {
  if (preference === "dark" || preference === "light") {
    return preference;
  }

  return systemScheme === "dark" ? "dark" : "light";
}
