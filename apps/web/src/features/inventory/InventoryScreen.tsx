import { lazy, Suspense, useMemo } from "react";
import { createInventoryRepository } from "../../repositories/inventoryRepository";
import { InventoryWorkspace, type InventoryScreenProps } from "./InventoryWorkspace";
export { isInventoryScreen } from "./InventoryWorkspace";

const MockWorkspace = lazy(() => import("./InventoryMockWorkspace").then(module => ({ default: module.InventoryMockWorkspace })));

export function InventoryScreen(props: InventoryScreenProps) {
  const repository = useMemo(() => createInventoryRepository(), [props.currentUser?.id]);
  const owner = props.dataSourceMode + ":" + (props.currentUser?.id ?? "anonymous");
  return <Suspense fallback={<div role="status">Загрузка раздела…</div>}>
    {props.dataSourceMode === "mock"
      ? <MockWorkspace key={owner} {...props} />
      : <InventoryWorkspace key={owner} {...props} repository={repository} />}
  </Suspense>;
}
