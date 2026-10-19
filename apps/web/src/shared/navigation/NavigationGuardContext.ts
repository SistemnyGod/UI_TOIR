import { createContext } from "react";

export type PageNavigationGuard = { blocks: () => boolean; confirm: () => boolean | Promise<boolean> };
export type NavigationGuardHost = { registerGuard: (guard: PageNavigationGuard) => () => void; requestLeave: (action: () => void) => void };
export const NavigationGuardContext = createContext<NavigationGuardHost | null>(null);
