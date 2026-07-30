import type { EmuShiftReportCategory, EmuShiftReportEmployeeOptionDto } from '../../../api/emuShiftReportContracts';

export type EmployeeCategoryFilter = 'all' | EmuShiftReportCategory | 'other';

export function normalizeEmployeeSearch(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function searchableText(employee: EmuShiftReportEmployeeOptionDto) {
  return normalizeEmployeeSearch([
    employee.fullName,
    employee.personnelNo,
    employee.position,
    employee.department,
  ].join(' '));
}

export function employeeCategoryLabel(category: EmuShiftReportEmployeeOptionDto['workerCategory']) {
  if (category === 'mechanic') return 'Слесарь';
  if (category === 'electrician') return 'Электрик';
  return 'Другая должность';
}

export function matchesEmployeeCategory(employee: EmuShiftReportEmployeeOptionDto, filter: EmployeeCategoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'other') return employee.workerCategory === null;
  return employee.workerCategory === filter;
}

function relevance(employee: EmuShiftReportEmployeeOptionDto, query: string) {
  if (!query) return 2;
  const personnelNo = normalizeEmployeeSearch(employee.personnelNo);
  const fullName = normalizeEmployeeSearch(employee.fullName);
  if (personnelNo === query) return 0;
  if (fullName.startsWith(query)) return 1;
  return 2;
}

export function filterAndSortEmployees(
  employees: EmuShiftReportEmployeeOptionDto[],
  query: string,
  favoriteIds: ReadonlySet<string>,
  options: {
    category?: EmployeeCategoryFilter;
    department?: string;
    favoriteOnly?: boolean;
  } = {},
) {
  const normalizedQuery = normalizeEmployeeSearch(query);
  const tokens = normalizedQuery ? normalizedQuery.split(' ') : [];
  const category = options.category ?? 'all';
  const department = options.department ?? '';

  return employees
    .filter((employee) => matchesEmployeeCategory(employee, category))
    .filter((employee) => !department || employee.department === department)
    .filter((employee) => !options.favoriteOnly || favoriteIds.has(employee.id))
    .filter((employee) => {
      if (!tokens.length) return true;
      const haystack = searchableText(employee);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((left, right) => {
      const byRelevance = relevance(left, normalizedQuery) - relevance(right, normalizedQuery);
      if (byRelevance) return byRelevance;
      const byFavorite = Number(favoriteIds.has(right.id)) - Number(favoriteIds.has(left.id));
      if (byFavorite) return byFavorite;
      return left.fullName.localeCompare(right.fullName, 'ru-RU');
    });
}