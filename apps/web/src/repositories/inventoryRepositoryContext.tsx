import { createContext, useContext } from "react";
import type { InventoryRepository } from "./inventoryRepository";

const InventoryRepositoryContext = createContext<InventoryRepository | null>(null);

export const InventoryRepositoryProvider = InventoryRepositoryContext.Provider;

export function useInventoryRepository() {
  const repository = useContext(InventoryRepositoryContext);
  if (!repository) {
    throw new Error("Inventory repository provider is not configured");
  }

  return repository;
}
