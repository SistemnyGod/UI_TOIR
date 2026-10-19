import { useState } from "react";

import type { TaskFilter, WorkTab } from "@/features/emuTask/workAccountingModel";
import type { ActionSheetItem } from "@/ui/ActionSheet";

/** Which list the screen shows: active works, work history or remarks. */
export function useWorkFilters() {
  const [tab, setTab] = useState<WorkTab>("tasks");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const subtitle = tab === "remarks" ? "Замечания" : taskFilter === "history" ? "История работ" : "Активные работы";
  const filterActions: ActionSheetItem[] = [
    { label: "Активные работы", icon: tab === "tasks" && taskFilter === "active" ? "checkmark-circle" : "construct-outline", onPress: () => { setTab("tasks"); setTaskFilter("active"); } },
    { label: "История работ", icon: tab === "tasks" && taskFilter === "history" ? "checkmark-circle" : "time-outline", onPress: () => { setTab("tasks"); setTaskFilter("history"); } },
    { label: "Замечания", icon: tab === "remarks" ? "checkmark-circle" : "chatbox-ellipses-outline", onPress: () => setTab("remarks") }
  ];

  return {
    tab, setTab, taskFilter, setTaskFilter, subtitle,
    filterMenu: { visible: filterMenuOpen, open: () => setFilterMenuOpen(true), close: () => setFilterMenuOpen(false), actions: filterActions }
  };
}
