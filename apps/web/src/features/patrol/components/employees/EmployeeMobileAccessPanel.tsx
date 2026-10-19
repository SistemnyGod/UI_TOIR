import { useState } from "react";
import type { ScreenId } from "../../../../types";
import { Button, ModalShell } from "../../../../shared/ui";

export function EmployeeMobileAccessPanel({
  canManageAccounts = false,
  onNavigate,
}: {
  canManageAccounts?: boolean;
  onNavigate: (screen: ScreenId) => void;
}) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <div className="employee-access-help-row">
        <Button onClick={() => setIsHelpOpen(true)} variant="ghost">
          Помощь
        </Button>
      </div>

      {isHelpOpen ? (
        <ModalShell
          className="employee-access-help-modal"
          onClose={() => setIsHelpOpen(false)}
          subtitle="Сотрудники и аккаунты телефона разделены: аккаунт нужен для входа в мобильное приложение, сотрудник привязывается к нему отдельно."
          title="Как устроен мобильный доступ"
        >
            <div className="employee-access-help-body">
              <div className="access-flow">
                <div className="access-step">
                  <span>1</span>
                  <strong>Создать аккаунт телефона</strong>
                  <p>Логин, временный пароль, правила входа и ограничения устройства.</p>
                </div>
                <div className="access-step">
                  <span>2</span>
                  <strong>Указать сотрудника</strong>
                  <p>Выберите сотрудника из общего справочника. Нового сотрудника сначала добавьте во вкладке «Сотрудники».</p>
                </div>
                <div className="access-step">
                  <span>3</span>
                  <strong>Прикрепить к аккаунту</strong>
                  <p>Один аккаунт может быть общим или привязанным к конкретному сотруднику.</p>
                </div>
              </div>

              {canManageAccounts ? <div className="access-actions">
                <Button
                  onClick={() => {
                    setIsHelpOpen(false);
                    onNavigate("accounts");
                  }}
                  variant="primary"
                >
                  Открыть мобильные аккаунты
                </Button>
              </div> : <p>Создание аккаунтов и привязка сотрудников доступны пользователям с правом управления мобильными аккаунтами.</p>}
            </div>
        </ModalShell>
      ) : null}
    </>
  );
}
