import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from "react-native";

import { recordRenderCrash } from "@/services/crashCapture";
import { darkColors, lightColors } from "@/ui/atomTheme";

type AppErrorBoundaryProps = {
  children: ReactNode;
  /** Runs after the guard taps "continue", once the tree is rendered again. */
  onRecover?: () => void;
};

type AppErrorBoundaryState = { failed: boolean };

/**
 * Root boundary. It sits outside ThemeProvider and the session gate so a
 * failure in either still ends on a calm screen instead of a white one.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordRenderCrash(error, info.componentStack);
  }

  private readonly recover = () => {
    // Render the tree again first: navigation only works once the navigator
    // is mounted. A screen that fails again lands back on this screen.
    this.setState({ failed: false }, () => {
      try {
        this.props.onRecover?.();
      } catch {
        // Navigation is best effort; the re-rendered screen stays usable.
      }
    });
  };

  render() {
    return this.state.failed ? <CrashRecoveryScreen onContinue={this.recover} /> : this.props.children;
  }
}

export function CrashRecoveryScreen({ onContinue }: { onContinue: () => void }) {
  const colors = useColorScheme() === "dark" ? darkColors : lightColors;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Экран не открылся</Text>
      <Text style={[styles.message, { color: colors.mutedText }]}>
        Произошла техническая ошибка. Сохранённые обходы, фото и очередь отправки остались на устройстве.
      </Text>
      <Text style={[styles.message, { color: colors.mutedText }]}>
        Сведения об ошибке без личных данных уйдут администратору со следующим диагностическим отчётом.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onContinue}
        style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.primaryPressed : colors.primary }]}
      >
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Продолжить работу</Text>
      </Pressable>
      <Text style={[styles.hint, { color: colors.mutedText }]}>Если экран снова не открывается, перезапустите приложение.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flexGrow: 1,
    gap: 12,
    justifyContent: "center",
    padding: 28
  },
  title: {
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    textAlign: "center"
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 420,
    textAlign: "center"
  },
  button: {
    alignSelf: "stretch",
    borderRadius: 12,
    marginTop: 12,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 22
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold",
    textAlign: "center"
  },
  hint: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center"
  }
});
