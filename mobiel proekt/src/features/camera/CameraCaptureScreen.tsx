import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  attachPointPhotoFromCamera,
  attachPointPhotoFromGallery,
  attachPointVideoFromCamera,
  attachPointVideoFromGallery,
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
  const { assignmentId, pointId, remarkId, mediaKind, source } = useLocalSearchParams<{
    assignmentId?: string;
    pointId?: string;
    remarkId?: string;
    mediaKind?: "photo" | "video";
    source?: "camera" | "gallery";
  }>();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureKind = mediaKind === "video" ? "video" : "photo";
  const isRemarkMedia = Boolean(remarkId);
  const autoStarted = useRef(false);

  const handleAttach = useCallback(async (selectedSource: "camera" | "gallery") => {
    setError(null);
    setIsBusy(true);

    try {
      if (isRemarkMedia && remarkId) {
        if (captureKind === "video") {
          await (selectedSource === "camera" ? attachRemarkVideoFromCamera(remarkId) : attachRemarkVideoFromGallery(remarkId));
        } else {
          await (selectedSource === "camera" ? attachRemarkPhotoFromCamera(remarkId) : attachRemarkPhotoFromGallery(remarkId));
        }
        router.replace("/(tabs)/work-accounting");
        return;
      }

      if (!assignmentId || !pointId) {
        setError("Не найдена точка обхода для привязки файла.");
        return;
      }

      if (captureKind === "video") {
        await (selectedSource === "camera"
          ? attachPointVideoFromCamera(assignmentId, pointId)
          : attachPointVideoFromGallery(assignmentId, pointId));
      } else {
        await (selectedSource === "camera"
          ? attachPointPhotoFromCamera(assignmentId, pointId)
          : attachPointPhotoFromGallery(assignmentId, pointId));
      }
      router.replace(`/patrol/assignment/${assignmentId}/point/${pointId}/fill`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить файл.");
    } finally {
      setIsBusy(false);
    }
  }, [assignmentId, captureKind, isRemarkMedia, pointId, remarkId, router]);

  useEffect(() => {
    if ((source === "camera" || source === "gallery") && !autoStarted.current) {
      autoStarted.current = true;
      void handleAttach(source);
    }
  }, [handleAttach, source]);

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
      subtitle="Файл сохранится локально и отправится на сервер при синхронизации."
    >
      <Card>
        <Text style={styles.title}>{captureKind === "video" ? "Добавить видео" : "Добавить фото"}</Text>
        <Text style={styles.text}>
          Используйте камеру Android или выберите файл из галереи. Видео ограничено по размеру, чтобы отчет можно было стабильно отправить через мобильную сеть.
        </Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isBusy ? <ActivityIndicator /> : null}
      <View style={styles.actions}>
        <PrimaryButton
          disabled={isBusy}
          icon={captureKind === "video" ? "videocam-outline" : "camera-outline"}
          label={captureKind === "video" ? "Записать видео" : "Сделать фото"}
          onPress={() => handleAttach("camera")}
        />
        <PrimaryButton disabled={isBusy} icon="images-outline" label="Выбрать из галереи" onPress={() => handleAttach("gallery")} variant="secondary" />
        <PrimaryButton disabled={isBusy} icon="arrow-back-outline" label="Назад" onPress={goBack} variant="ghost" />
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
