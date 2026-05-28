import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  attachPointPhotoFromCamera,
  attachPointPhotoFromGallery,
  attachRemarkPhotoFromCamera,
  attachRemarkPhotoFromGallery,
  attachRemarkVideoFromCamera,
  attachRemarkVideoFromGallery
} from "@/services/mediaAttachmentService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

export function CameraCaptureScreen() {
  const router = useRouter();
  const { assignmentId, pointId, remarkId, mediaKind } = useLocalSearchParams<{
    assignmentId?: string;
    pointId?: string;
    remarkId?: string;
    mediaKind?: "photo" | "video";
  }>();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureKind = mediaKind === "video" ? "video" : "photo";
  const isRemarkMedia = Boolean(remarkId);

  async function handleAttach(source: "camera" | "gallery") {
    setError(null);
    setIsBusy(true);

    try {
      if (isRemarkMedia && remarkId) {
        if (captureKind === "video") {
          await (source === "camera" ? attachRemarkVideoFromCamera(remarkId) : attachRemarkVideoFromGallery(remarkId));
        } else {
          await (source === "camera" ? attachRemarkPhotoFromCamera(remarkId) : attachRemarkPhotoFromGallery(remarkId));
        }
        router.replace("/(tabs)/work-accounting");
        return;
      }

      if (!assignmentId || !pointId) {
        setError("Не найдена точка обхода для привязки фото.");
        return;
      }

      await (source === "camera"
        ? attachPointPhotoFromCamera(assignmentId, pointId)
        : attachPointPhotoFromGallery(assignmentId, pointId));
      router.replace(`/patrol/assignment/${assignmentId}/point/${pointId}/fill`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить файл.");
    } finally {
      setIsBusy(false);
    }
  }

  function goBack() {
    if (isRemarkMedia) {
      router.replace("/(tabs)/work-accounting");
      return;
    }

    router.replace(`/patrol/assignment/${assignmentId}/point/${pointId}/fill`);
  }

  return (
    <Screen
      title={captureKind === "video" ? "Видео замечания" : "Фото"}
      subtitle="Используется штатная камера Android или галерея телефона."
    >
      <Card>
        <Text style={styles.title}>{captureKind === "video" ? "Добавить видео" : "Добавить фото"}</Text>
        <Text style={styles.text}>
          Файл сохранится локально и отправится на сервер при синхронизации. Для фото обхода можно выбрать камеру или галерею.
        </Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isBusy ? <ActivityIndicator /> : null}
      <View style={styles.actions}>
        <PrimaryButton disabled={isBusy} label={captureKind === "video" ? "Записать видео" : "Сделать фото"} onPress={() => handleAttach("camera")} />
        <PrimaryButton disabled={isBusy} label="Выбрать из галереи" onPress={() => handleAttach("gallery")} variant="secondary" />
        <PrimaryButton disabled={isBusy} label="Назад" onPress={goBack} variant="ghost" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10
  },
  title: {
    color: "#0f1a2b",
    fontSize: 20,
    fontWeight: "700"
  },
  text: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 21
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});
