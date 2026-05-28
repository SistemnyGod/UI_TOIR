import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getLocalUserProfile } from "@/db/repositories/bootstrapRepository";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

type LocalUserProfile = {
  serverUserId: string;
  fullName: string;
};

export default function OfflineLoginRoute() {
  const router = useRouter();
  const [profile, setProfile] = useState<LocalUserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getStoredOwnerUserId()
      .then((ownerUserId) => ownerUserId ? getLocalUserProfile(ownerUserId) : null)
      .then((loaded) => {
        if (isMounted) {
          setProfile(loaded);
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isReady) {
    return (
      <Screen title="Оффлайн-доступ" subtitle="Проверка локальных данных на телефоне.">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Оффлайн-доступ" subtitle="На телефоне нет сохраненного пользователя.">
        <Card>
          <Text style={styles.text}>Для первого входа нужен сервер. Проверьте Wi-Fi и адрес сервера.</Text>
        </Card>
        <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen title="Оффлайн-доступ" subtitle="Сессия истекла или сервер недоступен. Можно открыть сохраненные обходы на телефоне.">
      <Card>
        <Text style={styles.label}>Сохраненный пользователь</Text>
        <Text style={styles.title}>{profile.fullName}</Text>
        <Text style={styles.text}>
          Отчеты и заявки, которые уже загружены на телефон, доступны локально. Отправка на сервер продолжится после онлайн-входа.
        </Text>
      </Card>
      <PrimaryButton label="Продолжить оффлайн" onPress={() => router.replace("/(tabs)/patrol")} />
      <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800"
  },
  text: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 21
  }
});
