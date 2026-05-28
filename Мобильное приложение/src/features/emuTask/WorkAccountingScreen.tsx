import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { createShiftRemarkLocally, listShiftRemarks, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import {
  completeWorkTaskLocally,
  listLocalWorkTasks,
  pauseWorkTaskLocally,
  resumeWorkTaskLocally
} from "@/db/repositories/workTaskRepository";
import { WorkTaskDto, WorkTaskStatus } from "@/domain/emu/emuTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { loadWorkTasksOfflineFirst } from "@/services/workTaskService";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function WorkAccountingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [tasks, setTasks] = useState<WorkTaskDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [remarkTitle, setRemarkTitle] = useState("");
  const [remarkComment, setRemarkComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const reloadLocal = useCallback(async () => {
    const [nextTasks, nextRemarks] = await Promise.all([listLocalWorkTasks(), listShiftRemarks()]);
    setTasks(nextTasks);
    setRemarks(nextRemarks);
  }, []);

  const load = useCallback(() => {
    let isMounted = true;
    setLoading(true);

    void loadWorkTasksOfflineFirst()
      .then(async (items) => {
        const nextRemarks = await listShiftRemarks();
        if (isMounted) {
          setTasks(items);
          setRemarks(nextRemarks);
          setMessage(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(load);

  const summary = useMemo(
    () => ({
      tasks: tasks.length,
      active: tasks.filter((task) => task.status === "accepted" || task.status === "inProgress" || task.status === "paused").length,
      remarks: remarks.length
    }),
    [remarks.length, tasks]
  );

  async function handleComplete(task: WorkTaskDto) {
    const comment = comments[task.taskId] ?? "";
    if (!comment.trim()) {
      setMessage("Заполните результат работы перед завершением задачи.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await completeWorkTaskLocally(task, comment);
      setComments((current) => ({ ...current, [task.taskId]: "" }));
      await reloadLocal();
      setMessage("Задача сохранена на телефоне и будет отправлена при наличии интернета.");
      triggerForegroundSyncWithRetry();
    } catch {
      setMessage("Не удалось сохранить выполнение задачи.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePause(task: WorkTaskDto) {
    await applyTaskAction(
      () => pauseWorkTaskLocally(task, comments[task.taskId] ?? ""),
      "Задача поставлена на паузу и будет отправлена при наличии интернета.",
      "Не удалось поставить задачу на паузу."
    );
  }

  async function handleResume(task: WorkTaskDto) {
    await applyTaskAction(
      () => resumeWorkTaskLocally(task, comments[task.taskId] ?? ""),
      "Задача продолжена и будет отправлена при наличии интернета.",
      "Не удалось продолжить задачу."
    );
  }

  async function applyTaskAction(action: () => Promise<void>, successMessage: string, errorMessage: string) {
    setLoading(true);
    setMessage(null);

    try {
      await action();
      await reloadLocal();
      setMessage(successMessage);
      triggerForegroundSyncWithRetry();
    } catch {
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRemark() {
    if (!remarkComment.trim()) {
      setMessage("Заполните текст замечания.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await createShiftRemarkLocally({
        title: remarkTitle,
        comment: remarkComment
      });
      setRemarkTitle("");
      setRemarkComment("");
      await reloadLocal();
      setMessage("Замечание сохранено. Фото или видео можно добавить из списка ниже.");
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Работы" subtitle="Задачи и замечания по смене доступны оффлайн.">
      <View style={styles.summaryGrid}>
        <Metric label="Задач" value={summary.tasks} />
        <Metric label="Активно" value={summary.active} tone={summary.active > 0 ? "warning" : "neutral"} />
        <Metric label="Замечаний" value={summary.remarks} tone={summary.remarks > 0 ? "success" : "neutral"} />
      </View>

      <PrimaryButton label={loading ? "Обновляем..." : "Обновить задачи"} onPress={() => load()} disabled={loading} variant="secondary" />
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Card>
        <View style={styles.row}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Новое замечание</Text>
          <StatusPill label="Оффлайн" tone="neutral" />
        </View>
        <TextInput
          onChangeText={setRemarkTitle}
          placeholder="Краткое название"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          value={remarkTitle}
        />
        <TextInput
          multiline
          onChangeText={setRemarkComment}
          placeholder="Что заметили во время смены"
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textarea]}
          textAlignVertical="top"
          value={remarkComment}
        />
        <Text style={[styles.muted, { color: colors.mutedText }]}>После сохранения можно прикрепить фото или короткое видео.</Text>
        <PrimaryButton disabled={loading} label="Сохранить замечание" onPress={handleCreateRemark} />
      </Card>

      {remarks.length > 0 ? (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Последние замечания</Text>
          {remarks.slice(0, 5).map((remark) => (
            <View key={remark.remarkId} style={[styles.remarkRow, { borderColor: colors.border }]}>
              <View style={styles.titleBox}>
                <Text style={[styles.remarkTitle, { color: colors.text }]}>{remark.title}</Text>
                <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={3}>{remark.comment}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Вложений: {remark.mediaClientFileIds.length}</Text>
                <View style={styles.inlineActions}>
                  <PrimaryButton disabled={loading} label="Фото" onPress={() => router.push(`/camera/capture?remarkId=${remark.remarkId}&mediaKind=photo`)} variant="secondary" />
                  <PrimaryButton disabled={loading} label="Видео" onPress={() => router.push(`/camera/capture?remarkId=${remark.remarkId}&mediaKind=video`)} variant="secondary" />
                </View>
              </View>
              <StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} />
            </View>
          ))}
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <Card>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Назначенных задач нет</Text>
            <StatusPill label="Пусто" />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>Когда оператор назначит задачу учета работ на сотрудника, она появится здесь.</Text>
        </Card>
      ) : (
        tasks.map((task) => (
          <Card key={task.taskId}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{task.title}</Text>
              <StatusPill label={statusLabel(task.status)} tone={statusTone(task.status)} />
            </View>
            <View style={styles.meta}>
              <Text style={[styles.text, { color: colors.mutedText }]}>{formatPlannedAt(task.plannedAt)}</Text>
              <Text style={[styles.muted, { color: colors.mutedText }]}>Версия: {task.revision}</Text>
            </View>
            {canAct(task.status) ? (
              <>
                <TextInput
                  multiline
                  onChangeText={(value) => setComments((current) => ({ ...current, [task.taskId]: value }))}
                  placeholder={task.status === "paused" ? "Комментарий к продолжению" : "Комментарий или результат работы"}
                  placeholderTextColor="#9ca3af"
                  style={[styles.input, styles.textarea]}
                  textAlignVertical="top"
                  value={comments[task.taskId] ?? ""}
                />
                <View style={styles.actions}>
                  {task.status === "paused" ? (
                    <PrimaryButton label="Продолжить" onPress={() => void handleResume(task)} disabled={loading} variant="secondary" />
                  ) : (
                    <PrimaryButton label="Пауза" onPress={() => void handlePause(task)} disabled={loading} variant="secondary" />
                  )}
                  <PrimaryButton label="Завершить задачу" onPress={() => void handleComplete(task)} disabled={loading} />
                </View>
              </>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.text }, tone === "success" ? styles.success : null, tone === "warning" ? styles.warning : null]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function statusLabel(status: WorkTaskStatus) {
  const labels: Record<WorkTaskStatus, string> = {
    new: "Новая",
    accepted: "Назначена",
    inProgress: "В работе",
    paused: "Пауза",
    completedLocal: "Завершена локально",
    completedServer: "Завершена",
    cancelled: "Отменена",
    conflict: "Конфликт"
  };

  return labels[status] ?? status;
}

function statusTone(status: WorkTaskStatus) {
  if (status === "completedServer" || status === "completedLocal") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  if (status === "cancelled" || status === "conflict") {
    return "danger";
  }

  return "neutral";
}

function remarkStatusLabel(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "Отправлено";
  }

  if (status === "rejected" || status === "conflict") {
    return "Ошибка";
  }

  return "Ожидает";
}

function remarkStatusTone(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "success";
  }

  if (status === "rejected" || status === "conflict") {
    return "danger";
  }

  return "warning";
}

function canAct(status: WorkTaskStatus) {
  return status === "new" || status === "accepted" || status === "inProgress" || status === "paused";
}

function formatPlannedAt(value: string | null) {
  if (!value) {
    return "Время не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: "row",
    gap: 10
  },
  metric: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800"
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800"
  },
  titleBox: {
    flex: 1,
    gap: 6
  },
  meta: {
    gap: 4
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  muted: {
    fontSize: 13,
    lineHeight: 18
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f1a2b",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textarea: {
    minHeight: 88
  },
  actions: {
    gap: 8
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8
  },
  message: {
    color: "#1e5bff",
    fontSize: 14,
    lineHeight: 20
  },
  remarkRow: {
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingTop: 10
  },
  remarkTitle: {
    fontSize: 15,
    fontWeight: "800"
  },
  success: {
    color: "#22c55e"
  },
  warning: {
    color: "#f59e0b"
  }
});
