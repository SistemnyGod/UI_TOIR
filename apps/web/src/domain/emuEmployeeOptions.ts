import type { EmuFavoriteEmployeeDto } from "../api/contracts";
import type { EmployeeDirectoryItem } from "../types";

export type EmuEmployeeOption = Pick<EmployeeDirectoryItem, "department" | "fullName" | "id" | "personnelNo" | "position" | "status">;

/** Directory rows remain authoritative; scoped favorites supply missing rows. */
export function buildEmuEmployeeOptions(directory: EmuEmployeeOption[], favorites: EmuFavoriteEmployeeDto[]) {
  const activeFavorites = favorites.filter(employee => employee.isActive);
  const favoriteIds = new Set(activeFavorites.map(employee => employee.employeeId));
  const sourceById = new Map(directory.map(employee => [employee.id, employee]));
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
    employees: [...sourceById.values()].sort((left, right) => Number(favoriteIds.has(right.id)) - Number(favoriteIds.has(left.id)) || left.fullName.localeCompare(right.fullName, "ru")),
    favoriteIds,
  };
}
