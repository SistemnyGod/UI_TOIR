import { StatusBar } from "expo-status-bar";
import { ImageBackground, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, View } from "react-native";

import { useThemedStyles } from "@/ui/useThemedStyles";
import { LoginBrandHeader } from "./LoginBrandHeader";
import { LoginFormCard } from "./LoginFormCard";
import { LoginLinks } from "./LoginLinks";
import { LoginSavedAccess } from "./LoginSavedAccess";
import { createLoginStyles } from "./loginStyles";
import { useLoginScreen } from "./useLoginScreen";

const loginBackground = require("../../../assets/login-bg.png");

export function LoginScreen() {
  const styles = useThemedStyles(createLoginStyles);
  const state = useLoginScreen();

  return (
    <ImageBackground source={loginBackground} resizeMode="cover" style={styles.background}>
      <StatusBar style="light" />
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <LoginBrandHeader />
              <LoginFormCard {...state}>
                <LoginSavedAccess {...state} />
              </LoginFormCard>
              <LoginLinks {...state} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}
