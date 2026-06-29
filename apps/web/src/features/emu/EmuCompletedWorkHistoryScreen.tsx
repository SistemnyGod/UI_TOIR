import type { SessionUserDto } from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import type { EmployeeDirectoryItem } from "../../types";
import { EmuWorkHistoryWorkspace } from "./history/EmuWorkHistoryWorkspace";

export function EmuCompletedWorkHistoryScreen({
  currentUser,
  employeeDirectory,
  onNotify,
  workspace,
}: {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  return (
    <EmuWorkHistoryWorkspace
      currentUser={currentUser}
      employeeDirectory={employeeDirectory}
      onNotify={onNotify}
      workspace={workspace}
    />
  );
}
