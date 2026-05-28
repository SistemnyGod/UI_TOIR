import { useState } from "react";
import type { ScreenId } from "../../types";

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
        <button className="button ghost" onClick={() => setIsHelpOpen(true)} type="button">
          Помощь
        </button>
      </div>

      {isHelpOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsHelpOpen(false)}>
          <section
            aria-labelledby="employee-access-help-title"
            className="modal-window employee-access-help-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2 id="employee-access-help-title">Как устроен мобильный доступ</h2>
                <p>
                  Сотрудники и аккаунты телефона разделены: аккаунт нужен для входа в мобильное приложение, сотрудник привязывается к нему отдельно.
                </p>
              </div>
              <button className="modal-close" onClick={() => setIsHelpOpen(false)} type="button">
                Закрыть
              </button>
            </header>

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
                <button
                  className="button primary"
                  onClick={() => {
                    setIsHelpOpen(false);
                    onNavigate("accounts");
                  }}
                  type="button"
                >
                  Создать аккаунт телефона
                </button>
                <button
                  className="button ghost"
                  onClick={() => {
                    setIsHelpOpen(false);
                    onNavigate("accounts");
                    onNotify("Выберите аккаунт телефона и укажите ФИО сотрудника в блоке привязки");
                  }}
                  type="button"
                >
                  Быстрая привязка
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
