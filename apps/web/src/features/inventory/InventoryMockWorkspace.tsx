import { useMemo } from "react";
import { createMockInventoryRepository } from "../../repositories/mockInventoryRepository";
import { InventoryWorkspace, type InventoryScreenProps } from "./InventoryWorkspace";

export function InventoryMockWorkspace(props: InventoryScreenProps) {
  const repository = useMemo(() => createMockInventoryRepository(), [props.currentUser?.id]);
  return <InventoryWorkspace {...props} repository={repository} />;
}
