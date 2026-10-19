import type { ActivePatrol, EmployeeDirectoryItem, PatrolResult, RouteDirectoryItem, ServiceRequest } from "../src/types";

// One fixed observation time for statistics, the journal and planning preview.
// These are synthetic records, never substituted for API data.
export const dashboardPreviewNow = new Date(2026, 9, 2, 10, 24);
export const dashboardPreviewEmployees: EmployeeDirectoryItem[] = [
  "Галактионов Вадим Сергеевич", "Корюков Дмитрий Владимирович", "Костарев Илья Сергеевич", "Малых Семен Андреевич", "Хорьков Семен Николаевич",
].map((fullName, i) => ({
  id: `preview-employee-${i}`, fullName, initials: fullName.split(" ").slice(0, 2).map((word) => word[0]).join(""), personnelNo: `100${i}`,
  position: "Слесарь-ремонтник", department: "Энерго-механический участок", employeeGroup: "Производство", birthDate: "", zone: "Производство",
  status: "На смене", routesDone: 0, routesTotal: 0, mobileStatus: "Привязан", lastSeen: "02.10.2026, 10:24", phone: "", hiredAt: "",
  brigade: "1", shift: "День", leader: "", email: "",
}));

export const dashboardPreviewRoutes: RouteDirectoryItem[] = [
  { id: "preview-route-mill", name: "Помол", names: ["Галерея 2", "Галерея 3", "Галерея 5", "Галерея 6", "К-10"] },
  { id: "preview-route-furnaces", name: "Обход печей", names: Array.from({ length: 20 }, (_, i) => `Печь №${i + 1}`) },
].map(({ id, name, names }) => ({
  id, name, territory: "Производство", status: "Активен", description: "Плановая проверка оборудования", duration: "00:30", distance: "0.8 км", periodicity: "Каждый час",
  points: names.map((point, i) => ({ id: `${id}-point-${i}`, order: i + 1, name: point, zone: "Производство", type: "NFC", status: "Активна", tag: `preview-tag-${id}-${i}`, description: "", instruction: "Проверьте состояние оборудования", interval: "01:00", expectedTime: "00:30", requiresPhoto: false })),
}));

const issuePatrols: Record<string, number[]> = {
  "К-10": [2, 8, 16, 24, 32, 40, 56, 62], "Печь №3": [5, 19, 33, 47, 59],
  "Галерея 2": [8, 24, 60], "Галерея 3": [16, 60], "Галерея 5": [60],
};
function displayTime(date: Date) {
  return `${date.toLocaleDateString("ru-RU")}, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}
function patrol(day: number, month: number, finishedMinutes: number, number: number, inWeek: boolean): PatrolResult[] {
  const route = dashboardPreviewRoutes[number % 2];
  const employee = dashboardPreviewEmployees[number % dashboardPreviewEmployees.length];
  const finished = new Date(2026, month, day, 0, finishedMinutes);
  const started = new Date(finished.getTime() - 30 * 60_000);
  return route.points.map((point, i) => {
    const actual = new Date(started.getTime() + Math.round((i + 1) * 30 / route.points.length) * 60_000);
    const issue = inWeek ? issuePatrols[point.name]?.includes(number) === true : number % 7 === 0 && i === route.points.length - 1;
    return {
      id: `preview-${month}-${day}-patrol-${number}-point-${i}`, assignmentId: `preview-${month}-${day}-patrol-${number}`,
      status: issue ? "Замечание" : "Подтверждено", point: point.name, pointId: point.id, employee: employee.fullName, employeeId: employee.id,
      route: route.name, routeId: route.id, territory: route.territory, shift: "День", plannedAt: displayTime(started), actualAt: displayTime(actual),
      startedAt: displayTime(started), finishedAt: displayTime(finished), deviation: "0 мин", comment: issue ? "Повышенная вибрация. Требуется проверка оборудования." : "без комментария",
      photos: 0, attachments: [], issueType: issue ? "Неисправность" : "нет", severity: issue ? "Средняя" : "-", chronology: [], source: "mobile",
    };
  });
}

// Full patrols, with all 5/20 route points, chronological scans and a 30-minute duration.
// Week: 64 completed patrols, 14 with issues, 19 issue recordings on 5 points.
// October to the observation time: 22 patrols, 5 with issues, 7 issue recordings.
// Earlier September records exercise actual week/month boundaries and journal paging.
export const dashboardPreviewResults: PatrolResult[] = [];
for (let day = 1; day <= 27; day++) {
  for (let i = 0; i < 6; i++) dashboardPreviewResults.push(...patrol(day, 8, (7 + i * 2) * 60, day * 6 + i, false));
}
for (let i = 0; i < 64; i++) {
  const day = i < 56 ? 28 + Math.floor(i / 14) : 2;
  const month = day === 31 || i >= 56 ? 9 : 8;
  const date = day === 31 ? 1 : day;
  const minutes = i < 56 ? (6 + i % 14) * 60 + 30 : [390, 420, 450, 480, 510, 592, 605, 618][i - 56];
  dashboardPreviewResults.push(...patrol(date, month, minutes, i, true));
}

export const dashboardPreviewPlans: ServiceRequest[] = ["11:00", "11:30", "22:00"].map((scheduledTime, i) => {
  const employee = dashboardPreviewEmployees[i === 1 ? 1 : 0];
  const route = dashboardPreviewRoutes[i === 1 ? 0 : 1];
  return {
    id: `preview-plan-${i}`, requestKind: "patrol-assignment", title: route.name, status: "Назначена", priority: "Средний", sourceResultId: "", source: "web",
    employeeId: i === 2 ? undefined : employee.id, routeId: route.id, route: route.name, point: "", employee: i === 2 ? "" : employee.fullName,
    scheduledDate: "2026-10-02", scheduledTime, shift: i === 2 ? "Ночь" : "День", notifyEmployee: true, notificationText: `Плановый обход «${route.name}» в ${scheduledTime}`,
    createdAt: "02.10.2026, 08:00", dueAt: `02.10.2026, ${scheduledTime}`, responsible: "Администратор", description: "Плановый обход оборудования", timeline: [],
  };
});
export const dashboardPreviewActive: ActivePatrol[] = ["В пути", "Завершает"].map((status, i) => ({
  id: `preview-active-${i}`, employee: dashboardPreviewEmployees[i + 2].fullName, employeeId: dashboardPreviewEmployees[i + 2].id,
  routeId: dashboardPreviewRoutes[i].id, route: dashboardPreviewRoutes[i].name, zone: "Производство", shift: "День", currentPoint: dashboardPreviewRoutes[i].points[2].name,
  status: status as ActivePatrol["status"], progress: i ? 95 : 40, eta: "10:40", deviation: "0 мин", plannedAt: "02.10.2026, 10:00", startedAt: "02.10.2026, 10:00",
}));
