import { useState } from "react";

import type { ActionSheetItem } from "@/ui/ActionSheet";

/** The «Создать» sheet: one entry point for a new work or a new remark. */
export function useCreateMenu({ onCreateTask, onCreateRemark }: { onCreateTask: () => Promise<void>; onCreateRemark: () => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  const actions: ActionSheetItem[] = [
    { label: "Создать работу", icon: "construct-outline", onPress: onCreateTask },
    { label: "Создать замечание", icon: "chatbox-ellipses-outline", onPress: onCreateRemark }
  ];
  return { visible, open: () => setVisible(true), close: () => setVisible(false), actions };
}
