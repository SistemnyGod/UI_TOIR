import type { EmuSettingsDto, EmuWorkSessionDto } from "../../src/api/contracts";

export const workAccountingNow = "2026-10-13T13:30:00+05:00";
const names = ["Иванов Андрей Сергеевич", "Петров Илья Николаевич", "Соколов Дмитрий Викторович", "Орлова Анна Павловна", "Смирнов Павел Андреевич", "Кузнецов Алексей Иванович", "Морозов Сергей Петрович", "Волков Иван Олегович"];
export const workAccountingSettings: EmuSettingsDto = {
  sections: [
    { id: "section-repair", name: "Ремонтный участок", code: "repair", isActive: true, sortOrder: 1 },
    { id: "section-energy", name: "Энергетический участок", code: "energy", isActive: true, sortOrder: 2 },
  ],
  waitReasons: [{ id: "reason-material", name: "Ожидание материалов", code: "material", isActive: true, sortOrder: 1 }],
  notCompletedReasons: [{ id: "reason-access", name: "Нет доступа к оборудованию", code: "access", isActive: true, sortOrder: 1 }],
  workTemplates: [{ id: "template-inspection", name: "Осмотр оборудования", description: "Проверить ограждения, привод и состояние оборудования.", sectionId: "section-repair", sectionName: "Ремонтный участок", isActive: true, sortOrder: 1 }],
  favoriteEmployees: names.map((fullName, index) => ({ id: `favorite-${index + 1}`, employeeId: `employee-${index + 1}`, fullName, personnelNo: `${100 + index}`, position: index % 2 ? "Электромонтёр" : "Слесарь", department: index % 2 ? "Энергетический участок" : "Ремонтный участок", status: "Активен", isActive: true, createdAt: "2026-10-13T06:00:00+05:00" })),
};
export const workAccountingSessions: EmuWorkSessionDto[] = [
  makeWork(1, "Ремонт привода печи №3\nЗаменить муфту, проверить центровку и ограждение.", "section-repair", [1], ["Работает"]),
  makeWork(2, "Диагностика электродвигателя\nОжидаем кабель для подключения и контрольного пуска.", "section-energy", [2], ["В ожидании"]),
  makeWork(3, "Проверка конвейера №2\nОсмотреть натяжение ленты, аварийные выключатели и привод.", "section-repair", [3, 4], ["Работает", "На другой работе"]),
  makeWork(4, "Осмотр распределительного щита\nПроверить соединения и состояние вводного автомата.", "section-energy", [5], ["Работает"]),
  { ...makeWork(5, "Замена подшипника дымососа\nПродолжение ремонта после получения запасной части.", "section-repair", [6], ["В ожидании"]), isCarriedOver: true },
];
function makeWork(index: number, taskDescription: string, sectionId: string, employeeIds: number[], states: string[]): EmuWorkSessionDto {
  const arrivedAt = `2026-10-13T${String(8 + index).padStart(2, "0")}:00:00+05:00`;
  const id = `work-${index}`;
  return {
    id, workNumber: `ЭМУ-2026-${String(index).padStart(4, "0")}`, workDate: "2026-10-13", sectionId, sectionName: workAccountingSettings.sections.find(section => section.id === sectionId)!.name,
    createdByUserId: "operator", createdByName: "Оператор смены", planTaskId: null, taskDescription, status: "В работе", operationalStatus: states.every(state => state === "Работает") ? "Работает" : "В ожидании", resultStatus: "", resultComment: "", arrivedAt, completedAt: null, createdAt: arrivedAt, updatedAt: arrivedAt, deletedAt: null, deleteReason: "", workMinutes: 0, waitingMinutes: 0, otherWorkMinutes: 0, rowVersion: 1, isCarriedOver: false, source: "web",
    employees: employeeIds.map((employeeId, employeeIndex) => {
      const employee = workAccountingSettings.favoriteEmployees[employeeId - 1];
      const state = states[employeeIndex];
      return { id: `${id}-${employee.employeeId}`, employeeId: employee.employeeId, fullNameSnapshot: employee.fullName, positionSnapshot: employee.position, status: state, participationStatus: state, arrivedAt, finishedAt: null, activeIntervalStartedAt: arrivedAt, workMinutes: 0, waitingMinutes: 0, otherWorkMinutes: 0, personalWorkMinutes: 0, personalPauseMinutes: 0, currentPauseReason: state === "В ожидании" ? "Ожидание материалов" : "", intervals: [{ id: `interval-${index}-${employeeId}`, employeeId: employee.employeeId, workSessionId: id, workSessionEmployeeId: `${id}-${employee.employeeId}`, startedAt: arrivedAt, endedAt: null, status: state, reason: state === "В ожидании" ? "Ожидание материалов" : "", createdByName: "Оператор смены", createdAt: arrivedAt }] };
    }),
    attachments: [],
  };
}
export const workAccountingStore = {
  settings: workAccountingSettings, sessions: workAccountingSessions, planTasks: [], auditEvents: [],
};
