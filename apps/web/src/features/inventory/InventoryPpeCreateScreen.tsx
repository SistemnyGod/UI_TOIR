import type { ScreenId } from "../../types";
import { PpeIssueWorkflowScreen } from "./ppe/PpeIssueWorkflowScreen";

export function InventoryPpeCreateScreen({ onNavigate, onNotify }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void }) {
  return <PpeIssueWorkflowScreen onNavigate={onNavigate} onNotify={onNotify} />;
}
