const screens = {
  dashboard: {
    title: "Главное окно",
    subtitle: "Мини-дашборд и вход в основные сценарии обходов территории",
  },
  results: {
    title: "Результаты обходов",
    subtitle: "Факты прохождения точек, фото, комментарии и проблемы",
  },
  assign: {
    title: "Назначение на текущий момент",
    subtitle: "Быстро назначить сотрудников на обход территории",
  },
  schedule: {
    title: "Плановый обход",
    subtitle: "Недельный и месячный наряд по дневным и ночным сменам",
  },
  accounts: {
    title: "Мобильные аккаунты",
    subtitle: "Создание логинов для телефона и привязка сотрудников",
  },
  routes: {
    title: "Маршруты и точки",
    subtitle: "Создание маршрутов, точек и NFC/меток с разрешением повторов между маршрутами",
  },
};

const assignments = [
  { time: "08:15", route: "Периметр 1", employee: "Иванов П.", shift: "день", status: "идет" },
  { time: "10:00", route: "Склад ГСМ", employee: "Смирнова А.", shift: "день", status: "ожидает" },
  { time: "20:30", route: "Периметр 3", employee: "Орлов М.", shift: "ночь", status: "заплан." },
  { time: "23:00", route: "КПП Север", employee: "Ким Д.", shift: "ночь", status: "заплан." },
];

const results = [
  {
    id: "r1",
    route: "Периметр 1",
    point: "ТП-4",
    employee: "Иванов П.",
    time: "11:42",
    status: "проблема",
    photos: 2,
    problem: true,
    comment: "Поврежден замок на шкафу. Требуется заявка ремонтной группе.",
    sequence: ["КПП главный", "ТП-4", "Склад реагентов", "Выход Север"],
  },
  {
    id: "r2",
    route: "Склад ГСМ",
    point: "Ворота",
    employee: "Смирнова А.",
    time: "11:30",
    status: "пройдено",
    photos: 1,
    problem: false,
    comment: "Без замечаний. Фото ворот приложено.",
    sequence: ["Ворота", "Насосная", "Склад", "Выход"],
  },
  {
    id: "r3",
    route: "КПП Север",
    point: "Пост 2",
    employee: "Ким Д.",
    time: "10:54",
    status: "пройдено",
    photos: 0,
    problem: false,
    comment: "Пост на месте, журнал заполнен.",
    sequence: ["Пост 1", "Пост 2", "Шлагбаум", "Выход"],
  },
  {
    id: "r4",
    route: "Периметр 3",
    point: "Сектор Б",
    employee: "Орлов М.",
    time: "09:20",
    status: "пропуск",
    photos: 0,
    problem: false,
    comment: "Точка пропущена по разрешению старшего смены.",
    sequence: ["КПП", "Сектор А", "Сектор Б", "ТП-7"],
  },
  {
    id: "r5",
    route: "Котельная",
    point: "Вход",
    employee: "Петров С.",
    time: "08:44",
    status: "пройдено",
    photos: 3,
    problem: false,
    comment: "Вход закрыт, пломба на месте.",
    sequence: ["Вход", "Щитовая", "Насосная", "Выход"],
  },
];

const employees = [
  { id: "e1", name: "Иванов П. Сергеевич", state: "свободен", shift: "день" },
  { id: "e2", name: "Смирнова А. И.", state: "в обходе", shift: "день" },
  { id: "e3", name: "Петров С. М.", state: "свободен", shift: "день" },
  { id: "e4", name: "Орлов М. А.", state: "ночная с 20:00", shift: "ночь" },
  { id: "e5", name: "Ким Д. В.", state: "резерв", shift: "ночь" },
];

const patrolRoutes = [
  { id: "p1", name: "Периметр 1", points: 6, duration: "45 мин", status: "активен" },
  { id: "p2", name: "Склад ГСМ", points: 4, duration: "25 мин", status: "активен" },
  { id: "p3", name: "КПП Север", points: 5, duration: "35 мин", status: "активен" },
  { id: "p4", name: "Периметр 3", points: 8, duration: "60 мин", status: "активен" },
];

const accounts = [
  { id: "a1", login: "phone-01", password: "XK-2819", employees: ["Иванов П. Сергеевич", "Петров С. М."], status: "активен", sessions: 2 },
  { id: "a2", login: "phone-02", password: "KA-4481", employees: ["Смирнова А. И."], status: "активен", sessions: 1 },
  { id: "a3", login: "phone-03", password: "NP-1004", employees: [], status: "пустой", sessions: 0 },
  { id: "a4", login: "night-01", password: "NT-9033", employees: ["Орлов М. А.", "Ким Д. В."], status: "активен", sessions: 2 },
];

const routesDirectory = [
  {
    id: "route1",
    name: "Периметр 1",
    description: "Внешний обход территории",
    points: [
      { order: "01", name: "КПП главный", tag: "NFC-001", required: "да", status: "активна" },
      { order: "02", name: "ТП-4", tag: "NFC-014", required: "да", status: "активна" },
      { order: "03", name: "Склад реагентов", tag: "NFC-014", required: "да", status: "повтор ок" },
      { order: "04", name: "Выход Север", tag: "NFC-021", required: "нет", status: "активна" },
    ],
  },
  {
    id: "route2",
    name: "Склад ГСМ",
    description: "Проверка ворот, насосной и склада",
    points: [
      { order: "01", name: "Ворота", tag: "NFC-014", required: "да", status: "активна" },
      { order: "02", name: "Насосная", tag: "NFC-033", required: "да", status: "активна" },
      { order: "03", name: "Склад", tag: "NFC-041", required: "да", status: "активна" },
    ],
  },
  {
    id: "route3",
    name: "КПП Север",
    description: "Посты и шлагбаум",
    points: [
      { order: "01", name: "Пост 1", tag: "NFC-091", required: "да", status: "активна" },
      { order: "02", name: "Пост 2", tag: "NFC-092", required: "да", status: "активна" },
      { order: "03", name: "Шлагбаум", tag: "NFC-093", required: "да", status: "активна" },
    ],
  },
];

const state = {
  screen: "dashboard",
  selectedResult: "r1",
  selectedEmployee: "e1",
  selectedRoute: "p1",
  selectedAccount: "a1",
  selectedRouteDirectory: "route1",
  selectedScheduleCell: "night-2",
  resultMode: "all",
  scheduleMode: "week",
  accountMode: "accounts",
  routeMode: "points",
};

function chipClass(value) {
  const map = {
    идет: "success",
    активен: "success",
    активна: "success",
    пройдено: "success",
    ожидает: "warning",
    "заплан.": "info",
    проблема: "danger",
    пропуск: "warning",
    день: "day",
    ночь: "night",
    пустой: "warning",
    "повтор ок": "info",
  };
  return map[value] || "neutral";
}

function chip(label, extra = "") {
  return `<span class=\"chip ${extra || chipClass(label)}\">${label}</span>`;
}

function sectionTabs(targetId, stateKey, tabs) {
  const target = document.getElementById(targetId);
  if (!target) return;

  target.innerHTML = tabs
    .map(
      (tab) => `
        <button class=\"section-tab ${state[stateKey] === tab.id ? "active" : ""}\" data-view-group=\"${stateKey}\" data-view-tab=\"${tab.id}\" type=\"button\">
          <span>${tab.label}</span>
          <small>${tab.count}</small>
        </button>`,
    )
    .join("");
}

function setPanelActive(id, active) {
  const panel = document.getElementById(id);
  if (panel) panel.classList.toggle("active", active);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setScreen(screen) {
  if (!screens[screen]) return;
  state.screen = screen;
  document.querySelectorAll(".screen").forEach((node) => node.classList.toggle("active", node.id === screen));
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.screen === screen));
  document.querySelectorAll(".module-tab").forEach((node) => {
    const active = node.dataset.screen === screen;
    node.classList.toggle("active", active);
    node.setAttribute("aria-selected", String(active));
  });
  document.getElementById("screenTitle").textContent = screens[screen].title;
  document.getElementById("screenSubtitle").textContent = screens[screen].subtitle;
  document.getElementById("createButton").textContent =
    screen === "assign" ? "Назначить" : screen === "routes" ? "Маршрут" : screen === "accounts" ? "Аккаунт" : "Создать";
  history.replaceState(null, "", `#${screen}`);
}

function renderDashboard() {
  document.getElementById("todayAssignments").innerHTML = assignments
    .map(
      (item) => `
        <tr>
          <td><strong>${item.time}</strong></td>
          <td>${item.route}</td>
          <td>${item.employee}</td>
          <td>${chip(item.shift)}</td>
          <td>${chip(item.status)}</td>
        </tr>`,
    )
    .join("");

  const events = [
    ["11:42", "Проблема на ТП-4", "Периметр 1", "danger"],
    ["11:30", "Фото загружено", "Склад ГСМ", "success"],
    ["10:18", "Обход начат", "Периметр 1", "info"],
    ["09:20", "Пропуск разрешен", "Периметр 3", "warning"],
  ];
  document.getElementById("eventList").innerHTML = events
    .map((event) => `<li><time>${event[0]}</time><span>${event[1]}</span>${chip(event[2], event[3])}</li>`)
    .join("");
}

function renderResults() {
  const visibleResults = results.filter((item) => {
    if (state.resultMode === "problems") return item.problem;
    if (state.resultMode === "photos") return item.photos > 0;
    if (state.resultMode === "skips") return item.status === "пропуск";
    return true;
  });

  if (!visibleResults.some((item) => item.id === state.selectedResult)) {
    state.selectedResult = visibleResults[0]?.id || results[0].id;
  }

  sectionTabs("resultsTabs", "resultMode", [
    { id: "all", label: "Все", count: results.length },
    { id: "problems", label: "Проблемы", count: results.filter((item) => item.problem).length },
    { id: "photos", label: "С фото", count: results.filter((item) => item.photos > 0).length },
    { id: "skips", label: "Пропуски", count: results.filter((item) => item.status === "пропуск").length },
  ]);

  document.getElementById("resultsTable").innerHTML = visibleResults
    .map(
      (item) => `
        <tr class=\"clickable ${state.selectedResult === item.id ? "selected" : ""}\" data-result-id=\"${item.id}\">
          <td><strong>${item.route}</strong></td>
          <td>${item.point}</td>
          <td>${item.employee}</td>
          <td>${item.time}</td>
          <td>${chip(item.status)}</td>
          <td>${item.photos ? `${item.photos} фото` : "нет"}</td>
          <td>${item.problem ? chip("да", "danger") : chip("нет", "neutral")}</td>
        </tr>`,
    )
    .join("") || `<tr><td colspan=\"7\">По выбранной вкладке результатов нет</td></tr>`;

  const selected = results.find((item) => item.id === state.selectedResult) || results[0];
  document.getElementById("resultDetail").innerHTML = `
    <div class=\"drawer-title\">
      <div>
        <h2>${selected.route} / ${selected.point}</h2>
        <p>${selected.employee} · ${selected.time}</p>
      </div>
      ${chip(selected.status)}
    </div>
    <dl class=\"meta-list\">
      <div><dt>Комментарий</dt><dd>${selected.comment}</dd></div>
      <div><dt>Фото</dt><dd>${selected.photos ? `${selected.photos} вложения` : "Фото нет"}</dd></div>
      <div><dt>Связь с назначением</dt><dd>Назначение ${selected.route} от 13.05.2026</dd></div>
    </dl>
    <h3>Фото</h3>
    <div class=\"photo-grid\">
      ${selected.photos ? Array.from({ length: Math.min(selected.photos, 4) }, (_, i) => `<div class=\"photo-thumb\">IMG_${4211 + i}</div>`).join("") : `<div class=\"photo-thumb\">нет фото</div>`}
    </div>
    <h3>Последовательность точек</h3>
    <div class=\"point-timeline\">
      ${selected.sequence
        .map((point) => `<div class=\"timeline-row ${point === selected.point && selected.problem ? "problem" : ""}\"><span>${point}</span>${point === selected.point ? chip(selected.status) : chip("ок", "success")}</div>`)
        .join("")}
    </div>
  `;
}

function renderAssignment() {
  document.getElementById("employeeList").innerHTML = employees
    .map(
      (employee) => `
      <button class=\"select-card ${employee.id === state.selectedEmployee ? "active" : ""}\" data-employee-id=\"${employee.id}\" type=\"button\">
        <div class=\"row\">
          <strong>${employee.name}</strong>
          ${chip(employee.shift)}
        </div>
        <span>${employee.state}</span>
      </button>`,
    )
    .join("");

  document.getElementById("routeList").innerHTML = patrolRoutes
    .map(
      (route) => `
      <button class=\"select-card ${route.id === state.selectedRoute ? "active" : ""}\" data-patrol-route-id=\"${route.id}\" type=\"button\">
        <div class=\"row\">
          <strong>${route.name}</strong>
          ${chip(route.status)}
        </div>
        <span>${route.points} точек · примерно ${route.duration}</span>
      </button>`,
    )
    .join("");

  const employee = employees.find((item) => item.id === state.selectedEmployee);
  const route = patrolRoutes.find((item) => item.id === state.selectedRoute);
  const hasConflict = employee.state.includes("в обходе");
  document.getElementById("assignmentDraft").innerHTML = `
    <div class=\"summary-block\">
      <div class=\"summary-item\"><span>Сотрудник</span><strong>${employee.name}</strong>${chip(employee.shift)}</div>
      <div class=\"summary-item\"><span>Маршрут</span><strong>${route.name}</strong><small>${route.points} точек · ${route.duration}</small></div>
      <div class=\"summary-item\"><span>Старт</span><strong>сейчас</strong><small>Дедлайн: 13:00</small></div>
      <div class=\"notice ${hasConflict ? "danger-soft" : "warning-soft"}\">
        ${hasConflict ? "Есть конфликт: сотрудник уже выполняет обход. Назначение потребует подтверждения старшего смены." : "Конфликтов нет. У сотрудника нет другого активного обхода."}
      </div>
    </div>
  `;
}

function renderSchedule() {
  sectionTabs("scheduleTabs", "scheduleMode", [
    { id: "week", label: "Неделя", count: "14 смен" },
    { id: "month", label: "Месяц", count: "30 дней" },
    { id: "exceptions", label: "Исключения", count: "3" },
  ]);
  setPanelActive("scheduleWeekPanel", state.scheduleMode === "week");
  setPanelActive("scheduleMonthPanel", state.scheduleMode === "month");
  setPanelActive("scheduleExceptionsPanel", state.scheduleMode === "exceptions");

  const days = ["Пн 18", "Вт 19", "Ср 20", "Чт 21", "Пт 22", "Сб 23", "Вс 24"];
  const rows = [
    { label: "День", hours: "08:00-20:00", type: "день", names: ["Иванов", "Смирнова", "Петров", "Иванов", "Смирнова", "Петров", "Иванов"] },
    { label: "Ночь", hours: "20:00-08:00", type: "ночь", names: ["Орлов", "Ким", "Орлов", "Ким", "Орлов", "Ким", "Орлов"] },
  ];

  const header = `<div class=\"schedule-cell header\"></div>${days.map((day) => `<div class=\"schedule-cell header\">${day}</div>`).join("")}`;
  const body = rows
    .map(
      (row, rowIndex) => `
        <div class=\"schedule-cell shift-label\">${chip(row.type)}<strong>${row.hours}</strong></div>
        ${row.names
          .map((name, index) => {
            const key = `${rowIndex ? "night" : "day"}-${index}`;
            return `<button class=\"schedule-cell ${state.selectedScheduleCell === key ? "selected" : ""}\" data-schedule-cell=\"${key}\" data-date=\"${days[index]}\" data-shift=\"${row.type}\" data-employee=\"${name}\" type=\"button\">
              ${chip(row.type)}
              <strong>${name}</strong>
              <small>${row.type === "ночь" ? "КПП Север" : "Периметр 1"}</small>
            </button>`;
          })
          .join("")}`,
    )
    .join("");
  document.getElementById("weekGrid").innerHTML = header + body;

  document.getElementById("monthGrid").innerHTML = Array.from({ length: 30 }, (_, index) => {
    const isNight = index % 2 === 1;
    const exception = index % 7 === 0;
    return `<button class=\"month-day ${isNight ? "night" : ""} ${exception ? "exception" : ""}\" type=\"button\">
      <strong>${index + 1}</strong>
      <span>${isNight ? "Ночь" : "День"}</span>
    </button>`;
  }).join("");

  document.getElementById("scheduleExceptions").innerHTML = [
    ["20.05.2026", "Ким Д. отсутствует", "Замена: Орлов М.", "warning"],
    ["24.05.2026", "КПП Север усилен", "Добавлен второй обход ночью", "info"],
    ["29.05.2026", "Периметр 1", "Смена перенесена на 09:00", "warning"],
  ]
    .map(
      (item) => `
      <div class=\"status-card\">
        <div>
          <strong>${item[0]}</strong>
          <span>${item[1]}</span>
        </div>
        <em>${item[2]}</em>
        ${chip(item[3] === "info" ? "инфо" : "правка", item[3])}
      </div>`,
    )
    .join("");
}

function renderAccounts() {
  sectionTabs("accountTabs", "accountMode", [
    { id: "accounts", label: "Аккаунты", count: accounts.length },
    { id: "sessions", label: "Сессии", count: accounts.reduce((sum, item) => sum + item.sessions, 0) },
    { id: "bindings", label: "Привязки", count: accounts.reduce((sum, item) => sum + item.employees.length, 0) },
  ]);
  setPanelActive("accountListPanel", state.accountMode === "accounts");
  setPanelActive("accountSessionsPanel", state.accountMode === "sessions");
  setPanelActive("accountBindingsPanel", state.accountMode === "bindings");

  document.getElementById("accountsTable").innerHTML = accounts
    .map(
      (account) => `
      <tr class=\"clickable ${state.selectedAccount === account.id ? "selected" : ""}\" data-account-id=\"${account.id}\">
        <td><strong>${account.login}</strong></td>
        <td>${account.employees.length ? account.employees.map((name) => name.split(" ")[0]).join(", ") : "нет"}</td>
        <td>${chip(account.status)}</td>
        <td>${account.sessions}</td>
      </tr>`,
    )
    .join("");

  const account = accounts.find((item) => item.id === state.selectedAccount) || accounts[0];
  const available = employees.map((item) => item.name).filter((name) => !account.employees.includes(name));
  document.getElementById("accountSessions").innerHTML = accounts
    .map(
      (item) => `
      <div class=\"status-card ${state.selectedAccount === item.id ? "selected" : ""}\" data-account-id=\"${item.id}\">
        <div>
          <strong>${item.login}</strong>
          <span>${item.sessions ? `${item.sessions} активные сессии` : "нет активных сессий"}</span>
        </div>
        <em>${item.status === "активен" ? "последний вход сегодня" : "ожидает выдачи"}</em>
        ${chip(item.status)}
      </div>`,
    )
    .join("");

  document.getElementById("accountBindings").innerHTML = `
    <div class=\"binding-grid\">
      ${accounts
        .flatMap((item) =>
          item.employees.length
            ? item.employees.map(
                (name) => `
                <div class=\"binding-card ${state.selectedAccount === item.id ? "selected" : ""}\" data-account-id=\"${item.id}\">
                  <strong>${name}</strong>
                  <span>${item.login}</span>
                  ${chip(item.status)}
                </div>`,
              )
            : [
                `<div class=\"binding-card ${state.selectedAccount === item.id ? "selected" : ""}\" data-account-id=\"${item.id}\">
                  <strong>Не прикреплён</strong>
                  <span>${item.login}</span>
                  ${chip("пустой", "warning")}
                </div>`,
              ],
        )
        .join("")}
    </div>
  `;

  document.getElementById("accountDetail").innerHTML = `
    <div class=\"drawer-title\">
      <div>
        <h2>Аккаунт ${account.login}</h2>
        <p>${account.sessions} активные сессии</p>
      </div>
      ${chip(account.status)}
    </div>
    <dl class=\"meta-list\">
      <div><dt>Логин</dt><dd>${account.login}</dd></div>
      <div><dt>Пароль для выдачи</dt><dd>${account.password}</dd></div>
    </dl>
    <div class=\"account-tools\">
      <button class=\"button ghost\" id=\"generatePasswordButton\" type=\"button\">Новый пароль</button>
      <button class=\"button ghost\" id=\"resetSessionsButton\" type=\"button\">Сбросить сессии</button>
    </div>
    <h3 class=\"section-title\">Прикрепленные сотрудники</h3>
    <div class=\"employee-tags\">
      ${account.employees.length ? account.employees.map((name) => `<div class=\"employee-tag\">${name}<button data-remove-employee=\"${name}\" type=\"button\">убрать</button></div>`).join("") : `<div class=\"notice warning-soft\">Сотрудники еще не прикреплены.</div>`}
    </div>
    <h3>Добавить из списка ФИО</h3>
    <div class=\"attach-list\">
      ${available.slice(0, 4).map((name) => `<button data-attach-employee=\"${name}\" type=\"button\">${name}<span>+</span></button>`).join("")}
    </div>
  `;
}

function renderRoutes() {
  document.getElementById("routesDirectory").innerHTML = routesDirectory
    .map(
      (route) => `
      <button class=\"select-card ${route.id === state.selectedRouteDirectory ? "active" : ""}\" data-directory-route-id=\"${route.id}\" type=\"button\">
        <div class=\"row\">
          <strong>${route.name}</strong>
          ${chip("активен")}
        </div>
        <span>${route.points.length} точек · ${route.description}</span>
      </button>`,
    )
    .join("");

  const route = routesDirectory.find((item) => item.id === state.selectedRouteDirectory) || routesDirectory[0];
  const duplicateTags = route.points
    .map((point) => point.tag)
    .filter((tag, index, source) => source.indexOf(tag) !== index);

  const routeTabs = [
    { id: "details", label: "Реквизиты", count: "1" },
    { id: "points", label: "Точки", count: route.points.length },
    { id: "nfc", label: "NFC-метки", count: new Set(route.points.map((point) => point.tag)).size },
  ];

  const routeTabMarkup = routeTabs
    .map(
      (tab) => `
        <button class=\"section-tab ${state.routeMode === tab.id ? "active" : ""}\" data-view-group=\"routeMode\" data-view-tab=\"${tab.id}\" type=\"button\">
          <span>${tab.label}</span>
          <small>${tab.count}</small>
        </button>`,
    )
    .join("");

  const routeDetails = `
    <div class=\"editor-grid\">
      <label>Название маршрута<input type=\"text\" value=\"${route.name}\" /></label>
      <label>Описание<input type=\"text\" value=\"${route.description}\" /></label>
    </div>
    <div class=\"status-list\">
      <div class=\"status-card\">
        <div><strong>Версия маршрута</strong><span>v1, черновая модель без backend</span></div>
        ${chip("активен")}
      </div>
      <div class=\"status-card\">
        <div><strong>Правило обхода</strong><span>назначение фиксирует версию маршрута</span></div>
        ${chip("MVP", "info")}
      </div>
    </div>
    <div class=\"notice info-soft\">
      Маршрут редактируется как будущая версионируемая сущность. После старта обхода результаты должны ссылаться на конкретную версию маршрута, а не на текущий справочник.
    </div>`;

  const routePoints = `
    <div class=\"route-workspace\">
      <div class=\"route-main-pane\">
        <div class=\"notice info-soft\">
          Правило: метки могут повторяться для разных маршрутов. В этом прототипе показан повтор ${duplicateTags.length ? duplicateTags.join(", ") : "NFC-014"} внутри маршрута как допустимое состояние для обсуждения бизнес-правила.
        </div>
        <div class=\"table-wrap\" style=\"margin-top:16px\">
          <table>
            <thead><tr><th>№</th><th>Точка</th><th>Метка/NFC</th><th>Обяз.</th><th>Статус</th></tr></thead>
            <tbody>
              ${route.points
                .map(
                  (point) => `
                <tr>
                  <td><strong>${point.order}</strong></td>
                  <td>${point.name}</td>
                  <td>${point.tag}</td>
                  <td>${point.required}</td>
                  <td>${chip(point.status)}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class=\"drawer-actions\">
          <button class=\"button primary\" id=\"addPointButton\" type=\"button\">Добавить точку</button>
          <button class=\"button danger\" type=\"button\">Удалить точку</button>
        </div>
        <h3 class=\"section-title\">Предпросмотр порядка</h3>
        <div class=\"route-preview\">
          ${route.points
            .slice(0, 4)
            .map((point, index, list) => `<div class=\"preview-point\">${point.name.split(" ")[0]}</div>${index < list.length - 1 ? `<div class=\"preview-line\"></div>` : ""}`)
            .join("")}
        </div>
      </div>
      <aside class=\"route-side-pane\">
        <h3>Схема маршрута</h3>
        <div class=\"route-mini-map\">
          <svg viewBox=\"0 0 220 180\" aria-hidden=\"true\">
            <path d=\"M38 142 L38 42 L178 42 L178 126 L92 126 L92 82 L140 82\" />
            ${route.points
              .slice(0, 6)
              .map((point, index) => {
                const coords = [
                  [38, 142],
                  [38, 42],
                  [178, 42],
                  [178, 126],
                  [92, 126],
                  [92, 82],
                ][index];
                return `<g><circle cx=\"${coords[0]}\" cy=\"${coords[1]}\" r=\"13\" /><text x=\"${coords[0]}\" y=\"${coords[1] + 4}\">${point.order}</text></g>`;
              })
              .join("")}
          </svg>
        </div>
        <ol class=\"route-point-list\">
          ${route.points.map((point) => `<li><span>${point.order}</span>${point.name}</li>`).join("")}
        </ol>
        <dl class=\"route-stats\">
          <div><dt>Длина маршрута</dt><dd>2,4 км</dd></div>
          <div><dt>Ожидаемое время</dt><dd>00:35</dd></div>
        </dl>
      </aside>
    </div>`;

  const allTagUsages = routesDirectory.flatMap((item) =>
    item.points.map((point) => ({
      route: item.name,
      point: point.name,
      tag: point.tag,
      sameRoute: item.id === route.id,
    })),
  );

  const routeNfc = `
    <div class=\"nfc-grid\">
      ${route.points
        .map((point) => {
          const usages = allTagUsages.filter((item) => item.tag === point.tag);
          return `
          <div class=\"nfc-card\">
            <div>
              <strong>${point.tag}</strong>
              <span>${point.name}</span>
            </div>
            <p>${usages.map((item) => `${item.route}: ${item.point}`).join(" · ")}</p>
            ${chip(usages.length > 1 ? "повтор" : "уник.", usages.length > 1 ? "info" : "success")}
          </div>`;
        })
        .join("")}
    </div>
    <div class=\"notice warning-soft\">
      Для MVP рекомендуем предупреждать повтор NFC внутри одной версии маршрута. Повтор между разными маршрутами разрешён и должен разрешаться через контекст активного назначения.
    </div>`;

  document.getElementById("routeEditor").innerHTML = `
    <div class=\"panel-head\">
      <div>
        <h2>Редактор маршрута: ${route.name}</h2>
        <p>Точки находятся внутри маршрута; одинаковые метки допустимы в разных маршрутах</p>
      </div>
      <button class=\"button primary\" id=\"saveRouteButton\" type=\"button\">Сохранить</button>
    </div>
    <div class=\"section-tabs\" aria-label=\"Виды редактора маршрута\">${routeTabMarkup}</div>
    ${state.routeMode === "details" ? routeDetails : state.routeMode === "nfc" ? routeNfc : routePoints}
  `;
}

function renderAll() {
  renderDashboard();
  renderResults();
  renderAssignment();
  renderSchedule();
  renderAccounts();
  renderRoutes();
}

document.addEventListener("click", (event) => {
  const viewTab = event.target.closest("[data-view-tab]");
  if (viewTab) {
    const group = viewTab.dataset.viewGroup;
    state[group] = viewTab.dataset.viewTab;
    if (group === "resultMode") renderResults();
    if (group === "scheduleMode") renderSchedule();
    if (group === "accountMode") renderAccounts();
    if (group === "routeMode") renderRoutes();
    return;
  }

  const navTarget = event.target.closest("[data-screen]");
  if (navTarget) {
    setScreen(navTarget.dataset.screen);
    return;
  }

  const linkTarget = event.target.closest("[data-screen-link]");
  if (linkTarget) {
    setScreen(linkTarget.dataset.screenLink);
    return;
  }

  const resultRow = event.target.closest("[data-result-id]");
  if (resultRow) {
    state.selectedResult = resultRow.dataset.resultId;
    renderResults();
    return;
  }

  const employeeCard = event.target.closest("[data-employee-id]");
  if (employeeCard) {
    state.selectedEmployee = employeeCard.dataset.employeeId;
    renderAssignment();
    return;
  }

  const patrolRoute = event.target.closest("[data-patrol-route-id]");
  if (patrolRoute) {
    state.selectedRoute = patrolRoute.dataset.patrolRouteId;
    renderAssignment();
    return;
  }

  const scheduleCell = event.target.closest("[data-schedule-cell]");
  if (scheduleCell) {
    state.selectedScheduleCell = scheduleCell.dataset.scheduleCell;
    document.getElementById("shiftDate").value = scheduleCell.dataset.date;
    document.getElementById("shiftType").value = scheduleCell.dataset.shift === "ночь" ? "Ночная" : "Дневная";
    document.getElementById("shiftEmployee").value = `${scheduleCell.dataset.employee} ${scheduleCell.dataset.shift === "ночь" ? "М. А." : "П. С."}`;
    document.getElementById("shiftRoute").value = scheduleCell.dataset.shift === "ночь" ? "КПП Север" : "Периметр 1";
    renderSchedule();
    return;
  }

  const accountRow = event.target.closest("[data-account-id]");
  if (accountRow) {
    state.selectedAccount = accountRow.dataset.accountId;
    renderAccounts();
    return;
  }

  const removeEmployee = event.target.closest("[data-remove-employee]");
  if (removeEmployee) {
    const account = accounts.find((item) => item.id === state.selectedAccount);
    account.employees = account.employees.filter((name) => name !== removeEmployee.dataset.removeEmployee);
    renderAccounts();
    showToast("Сотрудник удален из мобильного аккаунта");
    return;
  }

  const attachEmployee = event.target.closest("[data-attach-employee]");
  if (attachEmployee) {
    const account = accounts.find((item) => item.id === state.selectedAccount);
    account.employees.push(attachEmployee.dataset.attachEmployee);
    account.status = "активен";
    renderAccounts();
    showToast("Сотрудник прикреплен к мобильному аккаунту");
    return;
  }

  const directoryRoute = event.target.closest("[data-directory-route-id]");
  if (directoryRoute) {
    state.selectedRouteDirectory = directoryRoute.dataset.directoryRouteId;
    renderRoutes();
    return;
  }

  if (event.target.closest("#generatePasswordButton")) {
    const account = accounts.find((item) => item.id === state.selectedAccount);
    account.password = `PW-${Math.floor(1000 + Math.random() * 9000)}`;
    renderAccounts();
    showToast("Новый пароль сгенерирован");
    return;
  }

  if (event.target.closest("#resetSessionsButton")) {
    const account = accounts.find((item) => item.id === state.selectedAccount);
    account.sessions = 0;
    renderAccounts();
    showToast("Сессии мобильного аккаунта сброшены");
    return;
  }

  if (event.target.closest("#assignNowButton")) {
    const employee = employees.find((item) => item.id === state.selectedEmployee);
    const route = patrolRoutes.find((item) => item.id === state.selectedRoute);
    showToast(`Назначение создано: ${employee.name} · ${route.name}`);
    return;
  }

  if (event.target.closest("#createAccountButton")) {
    const nextNumber = String(accounts.length + 1).padStart(2, "0");
    accounts.push({ id: `a${accounts.length + 1}`, login: `phone-${nextNumber}`, password: `NP-${Math.floor(1000 + Math.random() * 9000)}`, employees: [], status: "пустой", sessions: 0 });
    state.selectedAccount = accounts[accounts.length - 1].id;
    renderAccounts();
    showToast("Мобильный аккаунт создан");
    return;
  }

  if (event.target.closest("#newRouteButton")) {
    const newRoute = {
      id: `route${routesDirectory.length + 1}`,
      name: `Новый маршрут ${routesDirectory.length + 1}`,
      description: "Черновик маршрута обхода",
      points: [{ order: "01", name: "Новая точка", tag: "NFC-014", required: "да", status: "активна" }],
    };
    routesDirectory.push(newRoute);
    state.selectedRouteDirectory = newRoute.id;
    renderRoutes();
    showToast("Маршрут добавлен");
    return;
  }

  if (event.target.closest("#addPointButton")) {
    const route = routesDirectory.find((item) => item.id === state.selectedRouteDirectory);
    const order = String(route.points.length + 1).padStart(2, "0");
    route.points.push({ order, name: `Новая точка ${order}`, tag: "NFC-014", required: "да", status: "повтор ок" });
    renderRoutes();
    showToast("Точка добавлена. Повтор метки NFC-014 разрешен в прототипе");
  }
});

document.addEventListener("keydown", (event) => {
  const tab = event.target.closest(".module-tab, .section-tab");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

  const selector = tab.classList.contains("module-tab") ? ".module-tab" : `.section-tab[data-view-group=\"${tab.dataset.viewGroup}\"]`;
  const tabs = Array.from(document.querySelectorAll(selector));
  const currentIndex = tabs.indexOf(tab);
  const lastIndex = tabs.length - 1;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;

  event.preventDefault();
  tabs[nextIndex].focus();
  if (tabs[nextIndex].dataset.screen) {
    setScreen(tabs[nextIndex].dataset.screen);
  } else {
    const group = tabs[nextIndex].dataset.viewGroup;
    state[group] = tabs[nextIndex].dataset.viewTab;
    if (group === "resultMode") renderResults();
    if (group === "scheduleMode") renderSchedule();
    if (group === "accountMode") renderAccounts();
    if (group === "routeMode") renderRoutes();
  }
});

document.getElementById("globalSearch").addEventListener("input", (event) => {
  const query = event.target.value.trim();
  if (query.length > 2) showToast(`Поиск: ${query}`);
});

window.addEventListener("hashchange", () => {
  setScreen(window.location.hash.slice(1));
});

renderAll();
const initialScreen = window.location.hash.slice(1);
setScreen(screens[initialScreen] ? initialScreen : "dashboard");
