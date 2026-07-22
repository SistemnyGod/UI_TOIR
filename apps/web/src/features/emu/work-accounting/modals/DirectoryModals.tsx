import { useState } from "react";
import type { EmuReferenceDto, EmuWorkTemplateDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import type { EmployeeDirectoryItem } from "../../../../types";
import type { EmuEmployeeOption } from "../types";
import { ModalFrame } from "../components/ModalFrame";
import { filterEmployees, formatEmployeeShortName, isSystemOtherSection } from "../workAccountingUtils";

type CatalogTab = "sections" | "waitReasons" | "notCompletedReasons" | "templates";

export function CatalogsModal({ onClose, onNotify, workspace }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace }) {
  const [activeTab, setActiveTab] = useState<CatalogTab>("sections");
  const tabs: Array<{ id: CatalogTab; label: string; count: number }> = [
    { id: "sections", label: "Участки", count: workspace.settings.sections.length },
    { id: "waitReasons", label: "Причины ожидания", count: workspace.settings.waitReasons.length },
    { id: "notCompletedReasons", label: "Причины невыполнения", count: workspace.settings.notCompletedReasons.length },
    { id: "templates", label: "Типовые работы", count: workspace.settings.workTemplates.length },
  ];

  const content = activeTab === "sections" ? (
    <ReferenceBlock
      items={workspace.settings.sections}
      onCreate={(name) => workspace.actions.createSection({ name })}
      onNotify={onNotify}
      onUpdate={(item, patch) =>
        workspace.actions.updateSection(item.id, {
          isActive: patch.isActive ?? item.isActive,
          name: patch.name ?? item.name,
          sortOrder: item.sortOrder,
        })
      }
      protectSystemOther
      title="Участки"
    />
  ) : activeTab === "waitReasons" ? (
    <ReferenceBlock
      items={workspace.settings.waitReasons}
      onCreate={(name) => workspace.actions.createWaitReason({ name })}
      onNotify={onNotify}
      onUpdate={(item, patch) =>
        workspace.actions.updateWaitReason(item.id, {
          isActive: patch.isActive ?? item.isActive,
          name: patch.name ?? item.name,
          sortOrder: item.sortOrder,
        })
      }
      title="Причины ожидания"
    />
  ) : activeTab === "notCompletedReasons" ? (
    <ReferenceBlock
      items={workspace.settings.notCompletedReasons}
      onCreate={(name) => workspace.actions.createNotCompletedReason({ name })}
      onNotify={onNotify}
      onUpdate={(item, patch) =>
        workspace.actions.updateNotCompletedReason(item.id, {
          isActive: patch.isActive ?? item.isActive,
          name: patch.name ?? item.name,
          sortOrder: item.sortOrder,
        })
      }
      title="Причины невыполнения"
    />
  ) : (
    <TemplateBlock onNotify={onNotify} workspace={workspace} />
  );

  return (
    <ModalFrame wide onClose={onClose} title="Справочники ЭМУ">
      <div className="emu-catalog-modal">
        <nav className="emu-catalog-tabs" aria-label="Разделы справочников">
          {tabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className="emu-catalog-tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <em>{tab.count}</em>
            </button>
          ))}
        </nav>
        <div className="emu-catalog-content" role="tabpanel">
          {content}
        </div>
        <footer className="emu-catalog-footer">
          <span>Изменения сохраняются сразу после добавления или редактирования.</span>
          <button className="emu-primary-button" onClick={onClose} type="button">Сохранить и закрыть</button>
        </footer>
      </div>
    </ModalFrame>
  );
}

export function ReferenceBlock({
  items,
  onCreate,
  onNotify,
  onUpdate,
  protectSystemOther = false,
  title,
}: {
  items: EmuReferenceDto[];
  onCreate: (name: string) => Promise<EmuReferenceDto>;
  onNotify: (message: string) => void;
  onUpdate: (item: EmuReferenceDto, patch: { isActive?: boolean; name?: string }) => Promise<EmuReferenceDto>;
  protectSystemOther?: boolean;
  title: string;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const activeCount = items.filter((item) => item.isActive).length;
  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function create() {
    try {
      await onCreate(name);
      setName("");
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  async function toggleActive(item: EmuReferenceDto) {
    if (protectSystemOther && isSystemOtherSection(item) && item.isActive) {
      onNotify("Системный участок «Прочее» должен оставаться активным");
      return;
    }

    try {
      await onUpdate(item, { isActive: !item.isActive });
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  function startEdit(item: EmuReferenceDto) {
    setEditingId(item.id);
    setEditingName(item.name);
  }

  async function saveEdit(item: EmuReferenceDto) {
    if (!editingName.trim()) {
      onNotify("Укажите название справочника");
      return;
    }

    try {
      await onUpdate(item, { name: editingName.trim() });
      setEditingId("");
      setEditingName("");
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  return (
    <section className="emu-reference-block">
      <div className="emu-reference-heading">
        <div>
          <h4>{title}</h4>
          <span>{activeCount} активно · {items.length - activeCount} скрыто</span>
        </div>
        <em>{items.length}</em>
      </div>
      <div className="emu-inline-form">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новое значение" />
        <button disabled={!name.trim()} onClick={() => void create()} type="button">Добавить</button>
      </div>
      <input className="emu-reference-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по справочнику" />
      <div className="emu-reference-list">
        {filteredItems.map((item) => (
          <div className="emu-reference-row" key={item.id}>
            {editingId === item.id ? (
              <input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label={`Название ${title}`} />
            ) : (
              <span>{item.name}</span>
            )}
            <em>{protectSystemOther && isSystemOtherSection(item) ? "системный" : item.isActive ? "активно" : "скрыто"}</em>
            <div className="emu-reference-actions">
              {editingId === item.id ? (
                <>
                  <button onClick={() => void saveEdit(item)} type="button">Сохранить</button>
                  <button onClick={() => { setEditingId(""); setEditingName(""); }} type="button">Отмена</button>
                </>
              ) : (
                <>
                  <button onClick={() => startEdit(item)} type="button">Изменить</button>
                  <button disabled={protectSystemOther && isSystemOtherSection(item) && item.isActive} onClick={() => void toggleActive(item)} type="button">{item.isActive ? "Скрыть" : "Вернуть"}</button>
                </>
              )}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? <div className="emu-empty-state">По запросу ничего не найдено</div> : null}
      </div>
    </section>
  );
}

export function TemplateBlock({ onNotify, workspace }: { onNotify: (message: string) => void; workspace: EmuWorkspace }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const activeCount = workspace.settings.workTemplates.filter((template) => template.isActive).length;
  const filteredTemplates = workspace.settings.workTemplates.filter((template) =>
    [template.name, template.description, template.sectionName].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())),
  );

  async function create() {
    try {
      await workspace.actions.createWorkTemplate({ description, name, sectionId: sectionId || null });
      setName("");
      setDescription("");
      setSectionId("");
      onNotify("Типовая работа добавлена");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось добавить типовую работу");
    }
  }

  async function toggleTemplate(template: EmuWorkTemplateDto) {
    try {
      await workspace.actions.updateWorkTemplate(template.id, {
        description: template.description,
        isActive: !template.isActive,
        name: template.name,
        sectionId: template.sectionId,
        sortOrder: template.sortOrder,
      });
      onNotify("Типовая работа обновлена");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить типовую работу");
    }
  }

  return (
    <section className="emu-reference-block emu-template-block">
      <div className="emu-reference-heading">
        <div>
          <h4>Типовые работы</h4>
          <span>{activeCount} активно · {workspace.settings.workTemplates.length - activeCount} скрыто</span>
        </div>
        <em>{workspace.settings.workTemplates.length}</em>
      </div>
      <div className="emu-template-form-grid">
        <label className="emu-catalog-field">
          <span>Название работы</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, осмотр оборудования" />
        </label>
        <label className="emu-catalog-field">
          <span>Участок</span>
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            <option value="">Любой участок</option>
            {workspace.settings.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        </label>
      </div>
      <label className="emu-catalog-field emu-catalog-field-wide">
        <span>Описание и ожидаемый результат</span>
        <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Кратко опишите, что нужно сделать и какой результат получить" />
      </label>
      <button className="emu-primary-button emu-template-add-button" disabled={!name.trim()} onClick={() => void create()} type="button">Добавить типовую работу</button>
      <div className="emu-template-list-toolbar">
        <input className="emu-reference-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по типовым работам" />
        <span>{filteredTemplates.length} из {workspace.settings.workTemplates.length}</span>
      </div>
      <div className="emu-reference-list">
        {filteredTemplates.map((template) => (
          <div className="emu-reference-row emu-template-row" key={template.id}>
            <span>
              <strong>{template.name}</strong>
              <small>{template.sectionName || "Любой участок"}</small>
            </span>
            <em>{template.isActive ? "активно" : "скрыто"}</em>
            <button onClick={() => void toggleTemplate(template)} type="button">{template.isActive ? "Скрыть" : "Вернуть"}</button>
          </div>
        ))}
        {filteredTemplates.length === 0 ? <div className="emu-empty-state">Типовые работы не найдены</div> : null}
      </div>
    </section>
  );
}

export function FavoritesModal({
  employeeOptions,
  onClose,
  onNotify,
  workspace,
}: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [employeeToRemove, setEmployeeToRemove] = useState<EmuEmployeeOption | null>(null);
  const activeFavoriteIds = new Set(workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => employee.employeeId));
  const candidates = filterEmployees(employeeOptions, search).filter((employee) => !activeFavoriteIds.has(employee.id));
  const totalPages = Math.max(1, Math.ceil(candidates.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleCandidates = candidates.slice(pageStart, pageStart + pageSize);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updatePageSize(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  async function add(employeeId: string) {
    try {
      await workspace.actions.addFavoriteEmployee({ employeeId });
      onNotify("Сотрудник добавлен в избранное ЭМУ");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось добавить сотрудника");
    }
  }

  async function remove(employeeId: string) {
    try {
      await workspace.actions.removeFavoriteEmployee(employeeId);
      onNotify("Сотрудник скрыт из избранного ЭМУ");
      setEmployeeToRemove(null);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить из избранного");
    }
  }

  return (
    <ModalFrame wide onClose={onClose} title="Избранные сотрудники ЭМУ">
      <div className="emu-favorite-grid">
        <section className="emu-reference-block">
          <h4>Избранные</h4>
          <div className="emu-reference-list">
            {workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => (
              <div className="emu-reference-row" key={employee.employeeId}>
                <span title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
                <em>{employee.position || employee.department}</em>
                <button onClick={() => setEmployeeToRemove({ department: employee.department, fullName: employee.fullName, id: employee.employeeId, personnelNo: employee.personnelNo, position: employee.position, status: employee.status as EmployeeDirectoryItem["status"] })} type="button">Убрать</button>
              </div>
            ))}
          </div>
          {employeeToRemove ? (
            <div className="emu-nested-confirm">
              <strong>Убрать {employeeToRemove.fullName} из избранных ЭМУ?</strong>
              <p>Сотрудник будет скрыт только из быстрого списка. История работ и общий справочник сотрудников не изменятся.</p>
              <div className="emu-modal-actions">
                <button onClick={() => setEmployeeToRemove(null)} type="button">Отмена</button>
                <button className="emu-danger-button" onClick={() => void remove(employeeToRemove.id)} type="button">Убрать из избранных</button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="emu-reference-block">
          <div className="emu-reference-heading">
            <div>
              <h4>Общий справочник сотрудников</h4>
              <span>Найдено {candidates.length} · страница {currentPage} из {totalPages}</span>
            </div>
          </div>
          <div className="emu-reference-toolbar">
            <input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Поиск по ФИО, должности, подразделению" />
            <label>
              Показать
              <select value={pageSize} onChange={(event) => updatePageSize(event.target.value)}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="emu-reference-list">
            {visibleCandidates.map((employee) => (
              <div className="emu-reference-row" key={employee.id}>
                <span title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
                <em>{employee.position || employee.department}</em>
                <button onClick={() => void add(employee.id)} type="button">Добавить</button>
              </div>
            ))}
          </div>
          <div className="emu-pagination">
            <span>
              {candidates.length ? `${pageStart + 1}-${Math.min(pageStart + pageSize, candidates.length)} из ${candidates.length}` : "Нет сотрудников"}
            </span>
            <div>
              <button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Назад</button>
              <strong>{currentPage}</strong>
              <button disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Вперед</button>
            </div>
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}

