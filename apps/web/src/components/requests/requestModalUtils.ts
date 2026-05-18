export function getDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function buildNotificationText({
  employee,
  route,
  scheduledDate,
  scheduledTime,
}: {
  employee: string;
  route: string;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const routeText = route || "назначенный маршрут";
  const dateText = formatMessageDate(scheduledDate);
  const timeText = scheduledTime ? ` к ${scheduledTime}` : "";
  const employeeText = employee ? `${employee}, ` : "";

  return `${employeeText}необходимо пройти обход "${routeText}" ${dateText}${timeText}. Подтвердите получение задания в мобильном приложении.`;
}

function formatMessageDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return "сегодня";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}
