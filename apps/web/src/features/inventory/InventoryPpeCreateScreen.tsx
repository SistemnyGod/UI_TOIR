import type { ScreenId } from "../../types";
import { PpeIssueWorkflowScreen } from "./ppe/PpeIssueWorkflowScreen";

export function InventoryPpeCreateScreen({ onNavigate, onNotify, currentUserId }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void; currentUserId?: string }) {
  return <PpeIssueWorkflowScreen currentUserId={currentUserId} onNavigate={onNavigate} onNotify={onNotify} />;
}
