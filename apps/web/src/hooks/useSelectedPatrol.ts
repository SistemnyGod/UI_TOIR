import { useEffect, useMemo, useState } from "react";
import type { ActivePatrol } from "../types";

export function useSelectedPatrol(activePatrols: ActivePatrol[]) {
  const [selectedPatrolId, setSelectedPatrolId] = useState(activePatrols[0]?.id ?? "");
  const selectedPatrol = useMemo(
    () => activePatrols.find((patrol) => patrol.id === selectedPatrolId) ?? activePatrols[0],
    [activePatrols, selectedPatrolId],
  );

  useEffect(() => {
    if (activePatrols.length === 0) {
      if (selectedPatrolId) setSelectedPatrolId("");
      return;
    }

    if (!activePatrols.some((patrol) => patrol.id === selectedPatrolId)) {
      setSelectedPatrolId(activePatrols[0].id);
    }
  }, [activePatrols, selectedPatrolId]);

  return {
    selectedPatrol,
    selectedPatrolId: selectedPatrol?.id ?? "",
    setSelectedPatrolId,
  };
}
