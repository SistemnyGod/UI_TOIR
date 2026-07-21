import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { checkServerConnection } from "@/api/serverHealthApi";
import {
  defaultServerBaseUrl,
  getServerBaseUrl,
  isPilotHttpServer,
  localLanServerBaseUrl,
  resetServerBaseUrl,
} from "@/core/serverSettings";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type StatusMessage = {
  tone: "success" | "error" | "neutral";
  text: string;
};

export function ServerSettingsScreen() {
  const { colors } = useAppTheme();
  const [serverUrl, setServerUrl] = useState(defaultServerBaseUrl);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getServerBaseUrl().then((value) => {
      if (isMounted) {
        setServerUrl(value);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await checkServerConnection(serverUrl);
      if (!result.ok) {
        throw new Error(result.message);
      }
      const normalizedUrl = await getServerBaseUrl();
      setServerUrl(normalizedUrl);
      setStatusMessage({
        tone: "success",
        text: "Адрес сохранен. Следующий вход и синхронизация будут идти через этот сервер."
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить адрес сервера."
      });
    } finally {
      setIsBusy(false);
    }
  }, [serverUrl]);

  const handleUseLocalServer = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await checkServerConnection(localLanServerBaseUrl);
      const localUrl = result.url?.replace("/api/v1/mobile/health", "") ?? localLanServerBaseUrl;
      setServerUrl(localUrl);
      setStatusMessage({
        tone: result.ok ? "success" : "error",
        text: result.ok
          ? `Локальный сервер подключен: ${localUrl}`
          : `Локальный адрес сохранен, но сервер не ответил. Проверьте Wi-Fi и Windows Firewall. ${result.message}`
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Локальный сервер не разрешён для этой сборки."
      });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    setIsBusy(true);
    try {
      const defaultUrl = await resetServerBaseUrl();
      setServerUrl(defaultUrl);
      setStatusMessage({
        tone: "neutral",
        text: "Адрес сброшен к серверу по умолчанию."
      });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleCheck = useCallback(async () => {
    setIsBusy(true);
    const result = await checkServerConnection(serverUrl);
    setStatusMessage({
      tone: result.ok ? "success" : "error",
      text: result.message
    });
    setIsBusy(false);
  }, [serverUrl]);

  return (
    <Screen title="Сервер" subtitle="Подключение телефона к Patrol360 в локальной сети предприятия.">
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Адрес сервера</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Для работы в одной Wi-Fi/локальной сети используйте адрес сервера {localLanServerBaseUrl}. Локальные данные телефона при смене адреса не очищаются.
            </Text>
          </View>
          {isPilotHttpServer(serverUrl) ? <StatusPill label="Локальный HTTP" tone="neutral" /> : null}
        </View>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          keyboardType="url"
          onChangeText={setServerUrl}
          placeholder={localLanServerBaseUrl}
          placeholderTextColor={colors.mutedText}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          value={serverUrl}
        />

        <Text style={[styles.note, { color: colors.mutedText }]}>
          Проверка должна открыть /api/v1/mobile/health. Если телефон не подключается, чаще всего мешает Windows Firewall или Wi-Fi изолирует клиентов.
        </Text>

        {statusMessage ? (
          <View
            style={[
              styles.statusBox,
              statusMessage.tone === "success" ? styles.statusSuccess : null,
              statusMessage.tone === "error" ? styles.statusError : null
            ]}
          >
            <Text style={[styles.statusText, { color: colors.text }]}>{statusMessage.text}</Text>
          </View>
        ) : null}

        <View style={styles.buttonColumn}>
          <PrimaryButton
            disabled={isBusy}
            icon="wifi-outline"
            label={isBusy ? "Проверка..." : "Подключить локальный сервер"}
            onPress={handleUseLocalServer}
          />
          <PrimaryButton icon="pulse-outline" label="Проверить подключение" disabled={isBusy} onPress={handleCheck} variant="secondary" />
          <PrimaryButton icon="save-outline" label="Сохранить вручную" disabled={isBusy} onPress={handleSave} variant="secondary" />
          <PrimaryButton icon="refresh-circle-outline" label="Сбросить" disabled={isBusy} onPress={handleReset} variant="ghost" />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 18,
    fontWeight: "600"
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  note: {
    fontSize: 13,
    lineHeight: 18
  },
  statusBox: {
    borderRadius: 8,
    padding: 12
  },
  statusSuccess: {
    backgroundColor: "#ecfdf3"
  },
  statusError: {
    backgroundColor: "#fef2f2"
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },
  buttonColumn: {
    gap: 10
  }
});
