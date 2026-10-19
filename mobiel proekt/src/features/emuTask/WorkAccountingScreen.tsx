import { useEffect, useRef, useState } from "react";
import { FlatList } from "react-native";

import { ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { CompleteTaskModal, ParticipationModal, RemarkModal, TaskModal } from "@/features/emuTask/WorkAccountingForms";
import { CreateWorkButton, MediaSourceSheet, RemarkCard, WorkAccountingHeader, WorkListEmpty } from "@/features/emuTask/WorkAccountingParts";
import { getTaskPrimaryAction, TaskMenu } from "@/features/emuTask/WorkTaskActions";
import { WorkTaskCard } from "@/features/emuTask/WorkTaskCard";
import { useCreateMenu } from "@/features/emuTask/useCreateMenu";
import { useRemarkForm } from "@/features/emuTask/useRemarkForm";
import { useTaskActions } from "@/features/emuTask/useTaskActions";
import { useTaskForm } from "@/features/emuTask/useTaskForm";
import { useWorkAttachments } from "@/features/emuTask/useWorkAttachments";
import { useWorkDrafts } from "@/features/emuTask/useWorkDrafts";
import { useWorkFilters } from "@/features/emuTask/useWorkFilters";
import { useWorkList } from "@/features/emuTask/useWorkList";
import { ActionSheet } from "@/ui/ActionSheet";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { TransientNotice } from "@/ui/TransientNotice";
import { useStableListAnchor } from "@/ui/useStableListAnchor";

/**
 * «Работы»: local-first list of works and shift remarks with their forms.
 * State lives in the use* hooks next to this file; this component only wires
 * them to the list, the sheets and the modals.
 */
export function WorkAccountingScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [menuTask, setMenuTask] = useState<WorkItemDto | null>(null);
  const status = { setLoading, setMessage };

  const filters = useWorkFilters();
  const { tab } = filters;
  const list = useWorkList({ tab, taskFilter: filters.taskFilter, ...status });
  const { employees, sections, reloadLocal } = list;

  // Clearing a draft or leaving the screen closes whichever form is open; the
  // forms are created below, so they are reached through this ref.
  const closeFormsRef = useRef<() => void>(() => undefined);
  const drafts = useWorkDrafts({ employees, ...status, onShowDraftChoices: () => setMenuTask(null), closeForms: () => closeFormsRef.current() });

  const attachments = useWorkAttachments({ reloadLocal, ...status });
  const taskForm = useTaskForm({ drafts, employees, sections, reloadLocal, setTab: filters.setTab, setTaskFilter: filters.setTaskFilter, setMenuTask, ...status });
  const remarkForm = useRemarkForm({ drafts, employees, sections, reloadLocal, setTab: filters.setTab, onAttachAfterSave: attachments.remark.open, ...status });
  const actions = useTaskActions({ drafts, employees, reloadLocal, setTaskFilter: filters.setTaskFilter, setMenuTask, ...status });
  const { completion, participation } = actions;
  const createMenu = useCreateMenu({ onCreateTask: taskForm.openCreate, onCreateRemark: remarkForm.openCreate });
  const closeForms = () => { taskForm.close(); remarkForm.close(); completion.close(); participation.close(); };
  useEffect(() => { closeFormsRef.current = closeForms; });

  const listAnchor = useStableListAnchor(tab === 'tasks' ? list.tasks.map(item => item.itemId) : list.remarks.map(item => item.remarkId));
  const anyFormOpen = Boolean(taskForm.modal || remarkForm.open || completion.task || participation.action);
  const retryLeave = drafts.retryLeave;

  return (
    <Screen compactHeader plainBackground scroll={false} title="" bottomActionBackground="transparent"
      floatingNotice={<TransientNotice message={anyFormOpen ? null : message ?? list.refreshError} />}
      bottomAction={<CreateWorkButton disabled={loading} onPress={createMenu.open} />}>
      <WorkAccountingHeader subtitle={filters.subtitle} onOpenFilter={filters.filterMenu.open} />
      <FlatList<WorkItemDto | ShiftRemark>
        maintainVisibleContentPosition={listAnchor}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 13 }}
        data={tab === "tasks" ? list.tasks : list.remarks}
        keyExtractor={(item) => tab === "tasks" ? (item as WorkItemDto).itemId : (item as ShiftRemark).remarkId}
        ListEmptyComponent={<WorkListEmpty tab={tab} />}
        ListFooterComponent={list.showLoadMore ? <PrimaryButton disabled={list.loadingMore} icon="chevron-down-outline" label={list.loadingMore ? "Загружаем…" : "Загрузить ещё"} onPress={list.loadMore} variant="secondary" /> : null}
        onEndReached={() => { if (tab === "tasks" && !drafts.hasOpenForm()) void list.loadMore(); }}
        onEndReachedThreshold={0.4}
        removeClippedSubviews={false}
        renderItem={({ item }) => {
          if (tab === "tasks") {
            const task = item as WorkItemDto;
            const primary = getTaskPrimaryAction(task, {
              onStart: item => void participation.open("start", item),
              onJoin: item => void participation.open("join", item),
              onResume: task => void actions.resumeFromCard(task as WorkTaskDto),
              onComplete: task => void completion.open(task as WorkTaskDto)
            });
            return <WorkTaskCard task={task} primary={primary} loading={loading} onMenu={() => setMenuTask(task)} />;
          }
          const remark = item as ShiftRemark;
          return <RemarkCard remark={remark} disabled={loading} onAttach={() => attachments.remark.open({ remarkId: remark.remarkId, title: remark.sectionName ?? "Замечание" })} />;
        }}
      />

      <ActionSheet title="Что создать?" visible={createMenu.visible} onClose={createMenu.close} actions={createMenu.actions} />
      <ActionSheet title="Показать" visible={filters.filterMenu.visible} onClose={filters.filterMenu.close} actions={filters.filterMenu.actions} />
      <TaskModal
        draftNotice={drafts.draftNotice}
        onRetry={retryLeave}
        employees={employees}
        error={taskForm.modal ? message : null}
        loading={loading}
        modal={taskForm.modal}
        onClose={() => void drafts.closeWithDraft(taskForm.close)}
        onDeleteDraft={() => void drafts.clearDraft()}
        onSave={taskForm.save}
        sections={sections}
        setTaskEmployeeId={taskForm.setEmployeeId}
        setTaskSectionId={taskForm.setSectionId}
        setTaskText={taskForm.setText}
        taskEmployeeId={taskForm.employeeId}
        taskSectionId={taskForm.sectionId}
        taskText={taskForm.text}
      />

      <RemarkModal
        draftNotice={drafts.draftNotice}
        onRetry={retryLeave}
        employees={employees}
        error={remarkForm.open ? message : null}
        loading={loading}
        onClose={() => void drafts.closeWithDraft(remarkForm.close)}
        onDeleteDraft={() => void drafts.clearDraft()}
        onSave={remarkForm.save}
        open={remarkForm.open}
        remarkComment={remarkForm.comment}
        remarkEmployeeId={remarkForm.employeeId}
        remarkAttachmentAfterSave={remarkForm.attachmentAfterSave}
        remarkSectionId={remarkForm.sectionId}
        sections={sections}
        setRemarkComment={remarkForm.setComment}
        setRemarkEmployeeId={remarkForm.setEmployeeId}
        setRemarkAttachmentAfterSave={remarkForm.setAttachmentAfterSave}
        setRemarkSectionId={remarkForm.setSectionId}
      />

      <TaskMenu
        loading={loading}
        onClose={() => setMenuTask(null)}
        onComplete={(task) => void completion.open(task)}
        onEdit={(task) => void taskForm.openEdit(task)}
        onPause={actions.pause}
        onResume={actions.resume}
        onJoin={(task) => participation.open("join", task)}
        onAttach={(task) => {
          setMenuTask(null);
          attachments.work.open(task);
        }}
        onReplace={(task) => participation.open("replace", task)}
        onRepeat={(task) => void taskForm.openRepeat(task)}
        onStart={(task) => participation.open("start", task)}
        task={menuTask}
      />

      <ParticipationModal
        error={message}
        draftNotice={drafts.draftNotice}
        onRetry={retryLeave}
        onDeleteDraft={() => void drafts.clearDraft()}
        action={participation.action}
        employeeId={participation.employeeId}
        employees={employees}
        loading={loading}
        onClose={() => void drafts.closeWithDraft(participation.close)}
        onSave={participation.save}
        previousEmployeeId={participation.previousEmployeeId}
        reason={participation.reason}
        setEmployeeId={participation.setEmployeeId}
        setPreviousEmployeeId={participation.setPreviousEmployeeId}
        setReason={participation.setReason}
      />

      <CompleteTaskModal
        draftNotice={drafts.draftNotice}
        onRetry={retryLeave}
        comment={completion.comment}
        error={completion.task ? message : null}
        loading={loading}
        onChangeComment={completion.setComment}
        onClose={() => void drafts.closeWithDraft(completion.close)}
        onDeleteDraft={() => void drafts.clearDraft()}
        onSave={completion.save}
        task={completion.task}
      />
      <ActionSheet title="Сохранённые черновики" visible={drafts.draftChoices !== null} actions={drafts.draftChoices ?? []} onClose={drafts.closeDraftChoices} />
      <MediaSourceSheet
        title="Вложение к работе"
        visible={Boolean(attachments.work.target)}
        onClose={attachments.work.close}
        onPick={source => void attachments.work.attach(source)}
      />
      <MediaSourceSheet
        title={attachments.remark.target ? `Вложение: ${attachments.remark.target.title}` : "Вложение к замечанию"}
        visible={Boolean(attachments.remark.target)}
        onClose={attachments.remark.close}
        onPick={source => void attachments.remark.attach(source)}
      />
    </Screen>
  );
}
