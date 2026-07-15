const historyDays = 90;
const planningDays = 365;

export function buildOperationalPatrolDateRange(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  from.setDate(from.getDate() - historyDays);
  to.setDate(to.getDate() + planningDays);

  return { dateFrom: toDateInput(from), dateTo: toDateInput(to) };
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
