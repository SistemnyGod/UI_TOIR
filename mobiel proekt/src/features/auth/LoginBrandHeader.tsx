import { Text, View } from "react-native";

import { BrandMark } from "@/ui/BrandMark";
import { loginStyles as styles } from "./loginStyles";

export function LoginBrandHeader() {
  return (
    <View style={styles.logoBlock}>
      <View accessible accessibilityRole="image" accessibilityLabel="ATOM Minerals" style={styles.mark}>
        <BrandMark size={64} light />
      </View>
      <Text style={styles.logoText}>ATOM</Text>
      <Text style={styles.logoSubText}>MINERALS</Text>
      <Text style={styles.title}>Система обхода территории</Text>
      <Text style={styles.subtitle}>Вход в мобильное приложение</Text>
    </View>
  );
}
