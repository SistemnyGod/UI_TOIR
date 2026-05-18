import type { MobileAccount } from "../../types";
import { Panel } from "../ui";

export function MobileAccountMetrics({ accounts }: { accounts: MobileAccount[] }) {
  const activeAccounts = accounts.filter((account) => account.status === "Активен").length;
  const onlineSessions = accounts.filter((account) => account.session === "Онлайн").length;
  const unboundAccounts = accounts.filter((account) => account.status === "Не привязан").length;
  const blockedAccounts = accounts.filter((account) => account.status === "Заблокирован").length;

  return (
    <div className="metric-grid compact">
      <Panel className="metric-panel">
        <strong>{accounts.length}</strong>
        <span>Всего аккаунтов</span>
        <small>в мобильном контуре</small>
      </Panel>
      <Panel className="metric-panel success">
        <strong>{activeAccounts}</strong>
        <span>Активные</span>
        <small>доступны для входа</small>
      </Panel>
      <Panel className="metric-panel warning">
        <strong>{unboundAccounts}</strong>
        <span>Не привязаны</span>
        <small>ожидают сотрудника</small>
      </Panel>
      <Panel className="metric-panel">
        <strong>{onlineSessions}</strong>
        <span>Онлайн-сессии</span>
        <small>сейчас в системе</small>
      </Panel>
      <Panel className="metric-panel danger">
        <strong>{blockedAccounts}</strong>
        <span>Заблокированные</span>
        <small>временно закрыт вход</small>
      </Panel>
    </div>
  );
}
