import { StatusBar } from "expo-status-bar";
import { ImageBackground, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { LoginBrandHeader } from "./LoginBrandHeader";
import { LoginFormCard } from "./LoginFormCard";
import { LoginLinks } from "./LoginLinks";
import { LoginSavedAccess } from "./LoginSavedAccess";
import { loginSkin, loginStyles as styles } from "./loginStyles";
import { useLoginScreen } from "./useLoginScreen";

const loginBackground = require("../../../assets/login-bg.png");

export function LoginScreen() {
  const { colors, effectiveScheme } = useAppTheme();
  const skin = loginSkin(colors, effectiveScheme === "dark");
  const state = useLoginScreen();

  return (
    <ImageBackground source={loginBackground} resizeMode="cover" style={styles.background}>
      <StatusBar style="light" />
      <View style={[styles.overlay, skin.overlay]}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <LoginBrandHeader />
              <LoginFormCard {...state} colors={colors} skin={skin}>
                <LoginSavedAccess {...state} colors={colors} skin={skin} />
              </LoginFormCard>
              <LoginLinks {...state} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}
