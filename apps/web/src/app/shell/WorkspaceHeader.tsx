import type { ScreenConfig, ScreenId } from "../../types";
import { Button, PageHeader } from "../../shared/ui";

export function WorkspaceHeader({
  canUsePrimaryAction = true,
  currentScreen,
  primaryActionDisabledReason,
  screen,
  onPrimaryAction,
}: {
  canUsePrimaryAction?: boolean;
  currentScreen: ScreenConfig;
  primaryActionDisabledReason?: string;
  screen: ScreenId;
  onPrimaryAction: () => void;
}) {
  if (screen === "employees" || screen === "routes" || screen === "schedule" || screen === "assign" || screen === "dashboard" || screen === "results" || screen === "accounts" || screen === "perco-integration" || screen.startsWith("inventory-") || screen.startsWith("emu-")) {
    return null;
  }

  return (
    <PageHeader
      actions={(
        <div className="workspace-actions">
        <Button
          disabled={!canUsePrimaryAction}
          onClick={onPrimaryAction}
          title={!canUsePrimaryAction ? primaryActionDisabledReason : undefined}
          variant="primary"
        >
          {currentScreen.createLabel}
        </Button>
        </div>
      )}
      className="workspace-head"
      description={currentScreen.subtitle}
      title={currentScreen.title}
    />
  );
}
