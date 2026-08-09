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
  if (screen === "dashboard" || screen === "results" || screen === "accounts" || screen.startsWith("inventory-") || screen.startsWith("emu-")) {
    return null;
  }

  return (
    <PageHeader
      actions={(
        <div className="workspace-actions">
        {screen === "assign" ? (
          <Button variant="ghost" onClick={onPrimaryAction}>
            Проверить маршрут
          </Button>
        ) : null}
        <Button
          disabled={!canUsePrimaryAction}
          onClick={onPrimaryAction}
          title={!canUsePrimaryAction ? primaryActionDisabledReason : undefined}
          variant="primary"
        >
          {screen === "assign" ? "Создать заявку" : currentScreen.createLabel}
        </Button>
        </div>
      )}
      className="workspace-head"
      description={currentScreen.subtitle}
      title={currentScreen.title}
    />
  );
}
