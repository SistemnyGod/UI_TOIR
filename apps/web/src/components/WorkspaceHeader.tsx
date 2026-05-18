import type { ScreenConfig, ScreenId } from "../types";

export function WorkspaceHeader({
  currentScreen,
  screen,
  onOpenRequest,
  onPrimaryAction,
}: {
  currentScreen: ScreenConfig;
  screen: ScreenId;
  onOpenRequest: () => void;
  onPrimaryAction: () => void;
}) {
  return (
    <section className="workspace-head">
      <div>
        <h1>{currentScreen.title}</h1>
        <p>{currentScreen.subtitle}</p>
      </div>
      <div className="workspace-actions">
        {screen === "dashboard" || screen === "results" ? (
          <button className="button ghost" onClick={onOpenRequest} type="button">
            Открыть заявку
          </button>
        ) : null}
        <button className="button primary" onClick={onPrimaryAction} type="button">
          {screen === "dashboard" || screen === "results" ? "Создать заявку" : currentScreen.createLabel}
        </button>
      </div>
    </section>
  );
}
