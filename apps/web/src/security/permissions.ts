import type { SessionUserDto } from "../api/contracts";
import type { ScreenId } from "../types";

export type PermissionCode =
  | "dashboard.read"
  | "routes.read"
  | "employees.read"
  | "requests.read"
  | "assignments.read"
  | "routes.write"
  | "employees.write"
  | "requests.write"
  | "assignments.write"
  | "mobile_accounts.write"
  | "site_users.write"
  | "schedule.write"
  | "results.read"
  | "emu.view"
  | "emu.work-accounting.view"
  | "emu.dashboard.view"
  | "emu.history.view"
  | "emu.work.create"
  | "emu.work.update"
  | "emu.work.pause"
  | "emu.work.complete"
  | "emu.work.delete"
  | "emu.completed.delete"
  | "emu.directories.manage"
  | "emu.favorite-employees.manage"
  | "emu.plan.view"
  | "emu.plan.manage"
  | "emu.plan.approve"
  | "emu.scope.all"
  | "emu.plan.override-approval"
  | "emu.plan.recurrence.manage"
  | "emu.reports.view"
  | "emu.reports.export"
  | "emu.time.override"
  | "emu.audit.view"
  | "emu.shift.adjust"
  | "emu.decision.resolve"
  | "inventory.view"
  | "inventory.items.manage"
  | "inventory.stock.view"
  | "inventory.issue.manage"
  | "inventory.custody.manage"
  | "inventory.ppe.manage"
  | "inventory.reports.view"
  | "inventory.reports.export"
  | "inventory.settings.manage"
  | "inventory.import"
  | "inventory.audit.view"
  | "inventory.users.manage"
  | "integrations.perco.view"
  | "integrations.perco.manage"
  | "integrations.perco.sync"
  | "integrations.perco.match"
  | "integrations.perco.logs.view";

export function hasPermission(user: SessionUserDto | null | undefined, permission: PermissionCode) {
  if (!user) return false;
  if (user.roles.some((role) => role.toLowerCase() === "admin")) return true;
  return user.permissions.some((item) => item.toLowerCase() === permission.toLowerCase());
}

export function getPrimaryActionPermission(screen: ScreenId): PermissionCode | undefined {
  switch (screen) {
    case "dashboard":
    case "results":
      return "requests.write";
    case "assign":
      return "assignments.write";
    case "employees":
      return "employees.write";
    case "schedule":
      return "schedule.write";
    case "accounts":
      return "mobile_accounts.write";
    case "routes":
      return "routes.write";
    case "users":
      return "site_users.write";
    case "emu-dashboard":
      return "emu.dashboard.view";
    case "emu-work-accounting":
      return "emu.work-accounting.view";
    case "emu-completed-work-history":
      return "emu.history.view";
    case "inventory-overview":
    case "inventory-items":
    case "inventory-employees":
      return "inventory.view";
    case "inventory-issue":
    case "inventory-operations":
      return "inventory.issue.manage";
    case "inventory-custody":
      return "inventory.custody.manage";
    case "inventory-ppe":
      return "inventory.ppe.manage";
    case "inventory-history":
    case "inventory-system-log":
      return "inventory.audit.view";
    case "inventory-reports":
      return "inventory.reports.view";
    case "inventory-users":
      return "inventory.users.manage";
    case "inventory-settings":
      return "inventory.settings.manage";
    case "perco-integration":
      return "integrations.perco.view";
    default:
      return undefined;
  }
}

export function getPermissionDeniedMessage(permission?: PermissionCode) {
  return permission
    ? `Недостаточно прав для действия: требуется ${permission}.`
    : "Недостаточно прав для выполнения действия.";
}
