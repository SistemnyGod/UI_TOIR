import type { ScreenConfig, ScreenId } from "../../types";

export function WorkspaceHeader({
  canUsePrimaryAction = true,
  currentScreen,
  primaryActionDisabledReason,
  screen,
  onOpenRequest,
  onPrimaryAction,
}: {
  canUsePrimaryAction?: boolean;
  currentScreen: ScreenConfig;
  primaryActionDisabledReason?: string;
  screen: ScreenId;
  onOpenRequest: () => void;
  onPrimaryAction: () => void;
}) {
  if (screen === "dashboard" || screen === "accounts" || screen.startsWith("inventory-") || screen.startsWith("emu-")) {
    return null;
  }

  return (
    <section className="workspace-head">
      <div>
        <h1>{currentScreen.title}</h1>
        <p>{currentScreen.subtitle}</p>
      </div>
      <div className="workspace-actions">
        {screen === "results" ? (
          <button className="button ghost" onClick={onOpenRequest} type="button">
            Открыть заявку
          </button>
        ) : null}
        {screen === "assign" ? (
          <button className="button ghost" onClick={onPrimaryAction} type="button">
            Проверить маршрут
          </button>
        ) : null}
        <button
          className="button primary"
          disabled={!canUsePrimaryAction}
          onClick={onPrimaryAction}
          title={!canUsePrimaryAction ? primaryActionDisabledReason : undefined}
          type="button"
        >
          {screen === "results" ? "Создать заявку" : screen === "assign" ? "Создать заявку" : currentScreen.createLabel}
        </button>
      </div>
    </section>
  );
}
