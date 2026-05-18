import type {
  ActivePatrol,
  Employee,
  EmployeeDirectoryItem,
  Metric,
  MobileAccount,
  PatrolResult,
  RouteDirectoryItem,
  RouteOption,
  ScheduleCell,
  ScreenConfig,
  ServiceRequest,
  SiteUser,
} from "./types";

export const screens: ScreenConfig[] = [
  {
    id: "dashboard",
    label: "Дашборд",
    shortLabel: "Главное",
    hint: "сводка смены",
    title: "Детальный дашборд обходов",
    subtitle: "Онлайн-мониторинг патрулирования территории на сегодня",
    icon: "¦",
    createLabel: "Назначить",
  },
  {
    id: "results",
    label: "Результаты обходов",
    shortLabel: "Результаты",
    hint: "обходы и проблемы",
    title: "Результаты обходов",
    subtitle: "Факты прохождения точек, фото, комментарии и замечания",
    icon: "≡",
    createLabel: "Экспорт",
  },
  {
    id: "assign",
    label: "Назначения",
    shortLabel: "Назначения",
    hint: "сейчас",
    title: "Назначения",
    subtitle: "Оперативное распределение сотрудников на маршруты в реальном времени",
    icon: "+",
    createLabel: "Назначить",
  },
  {
    id: "employees",
    label: "Сотрудники",
    shortLabel: "Сотрудники",
    hint: "учет и смены",
    title: "Сотрудники",
    subtitle: "Учет, поиск, создание и управление сотрудниками",
    icon: "◎",
    createLabel: "Создать сотрудника",
  },
  {
    id: "schedule",
    label: "Плановый обход",
    shortLabel: "План",
    hint: "день / ночь",
    title: "Планирование обходов",
    subtitle: "Недельный и месячный наряд по дневным и ночным сменам",
    icon: "□",
    createLabel: "Сохранить план",
  },
  {
    id: "accounts",
    label: "Мобильные аккаунты",
    shortLabel: "Аккаунты",
    hint: "мобильный вход",
    title: "Мобильные аккаунты",
    subtitle: "Создание логинов для телефона и привязка сотрудников по ФИО",
    icon: "◉",
    createLabel: "Создать аккаунт",
  },
  {
    id: "routes",
    label: "Маршруты и точки",
    shortLabel: "Маршруты",
    hint: "точки и NFC",
    title: "Маршруты и точки",
    subtitle: "Управление маршрутами, точками контроля и NFC-метками",
    icon: "⌖",
    createLabel: "Создать маршрут",
  },
  {
    id: "users",
    label: "Пользователи сайта",
    shortLabel: "Пользователи",
    hint: "web-доступ",
    title: "Пользователи сайта",
    subtitle: "Управление доступом к веб-панели: администратор, оператор, руководитель, аудитор",
    icon: "◌",
    createLabel: "Создать пользователя",
  },
];

export const dashboardMetrics: Metric[] = [];
export const activePatrols: ActivePatrol[] = [];
export const patrolResults: PatrolResult[] = [];
export const serviceRequests: ServiceRequest[] = [];
export const employees: Employee[] = [];
export const employeeDirectory: EmployeeDirectoryItem[] = [];
export const siteUsers: SiteUser[] = [];
export const assignableRoutes: RouteOption[] = [];
export const initialAccounts: MobileAccount[] = [];
export const routeDirectory: RouteDirectoryItem[] = [];
export const scheduleCells: ScheduleCell[] = [];
export const securityEvents: string[][] = [];

export const weekDays = ["Пн 11.05", "Вт 12.05", "Ср 13.05", "Чт 14.05", "Пт 15.05", "Сб 16.05", "Вс 17.05"];
