import type { ScreenId } from "../../types";
import { Panel } from "../ui";

export function EmployeeMobileAccessPanel({
  onNavigate,
  onNotify,
}: {
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
}) {
  return (
    <Panel
      className="employee-access-panel"
      title="Как устроен мобильный доступ"
      note="Сотрудники и аккаунты телефона разделены: аккаунт нужен для входа в мобильное приложение, сотрудник привязывается к нему отдельно."
      actions={
        <button className="button primary" onClick={() => onNavigate("accounts")} type="button">
          Создать аккаунт телефона
        </button>
      }
    >
      <div className="access-flow">
        <div className="access-step">
          <span>1</span>
          <strong>Создать аккаунт телефона</strong>
          <p>Логин, временный пароль, правила входа и ограничения устройства.</p>
        </div>
        <div className="access-step">
          <span>2</span>
          <strong>Указать сотрудника</strong>
          <p>ФИО можно выбрать из справочника или ввести вручную до подключения backend.</p>
        </div>
        <div className="access-step">
          <span>3</span>
          <strong>Прикрепить к аккаунту</strong>
          <p>Один аккаунт может быть общим или привязанным к конкретному сотруднику.</p>
        </div>
      </div>
      <div className="access-actions">
        <button className="button ghost" onClick={() => onNavigate("accounts")} type="button">
          Перейти к мобильным аккаунтам
        </button>
        <button
          className="button ghost"
          onClick={() => {
            onNavigate("accounts");
            onNotify("Выберите аккаунт телефона и укажите ФИО сотрудника в блоке привязки");
          }}
          type="button"
        >
          Быстрая привязка
        </button>
      </div>
    </Panel>
  );
}
