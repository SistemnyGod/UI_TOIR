import { useState } from "react";
import type { ScreenId } from "../../../../types";
import { Button, ModalShell } from "../../../../shared/ui";

export function EmployeeMobileAccessPanel({
  onNavigate,
  onNotify,
}: {
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
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
                  <p>ФИО можно выбрать из справочника или ввести вручную до подключения backend.</p>
                </div>
                <div className="access-step">
                  <span>3</span>
                  <strong>Прикрепить к аккаунту</strong>
                  <p>Один аккаунт может быть общим или привязанным к конкретному сотруднику.</p>
                </div>
              </div>

              <div className="access-actions">
                <Button
                  onClick={() => {
                    setIsHelpOpen(false);
                    onNavigate("accounts");
                  }}
                  variant="primary"
                >
                  Создать аккаунт телефона
                </Button>
                <Button
                  onClick={() => {
                    setIsHelpOpen(false);
                    onNavigate("accounts");
                    onNotify("Выберите аккаунт телефона и укажите ФИО сотрудника в блоке привязки");
                  }}
                  variant="ghost"
                >
                  Быстрая привязка
                </Button>
              </div>
            </div>
        </ModalShell>
      ) : null}
    </>
  );
}
