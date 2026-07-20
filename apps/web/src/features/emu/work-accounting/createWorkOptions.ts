import type { EmuFavoriteEmployeeDto, EmuWorkTemplateDto } from "../../../api/contracts";
import type { EmuEmployeeOption } from "./types";

export function buildCreateWorkEmployeeOptions(
  employeeOptions: EmuEmployeeOption[],
  favorites: EmuFavoriteEmployeeDto[],
) {
  const activeFavorites = favorites.filter((employee) => employee.isActive);
  const favoriteIds = new Set(activeFavorites.map((employee) => employee.employeeId));
  const sourceById = new Map(employeeOptions.map((employee) => [employee.id, employee]));

  for (const favorite of activeFavorites) {
    if (!sourceById.has(favorite.employeeId)) {
      sourceById.set(favorite.employeeId, {
        department: favorite.department,
        fullName: favorite.fullName,
        id: favorite.employeeId,
        personnelNo: favorite.personnelNo,
        position: favorite.position,
        status: favorite.status as EmuEmployeeOption["status"],
      });
    }
  }

  return {
    employees: [...sourceById.values()].sort(
      (left, right) => Number(favoriteIds.has(right.id)) - Number(favoriteIds.has(left.id)) || left.fullName.localeCompare(right.fullName, "ru"),
    ),
    favoriteIds,
  };
}

export function buildCreateWorkTemplates(templates: EmuWorkTemplateDto[], sectionId: string) {
  return templates
    .filter((template) => template.isActive)
    .sort((left, right) => Number(right.sectionId === sectionId) - Number(left.sectionId === sectionId) || left.sortOrder - right.sortOrder)
    .slice(0, 8);
}
