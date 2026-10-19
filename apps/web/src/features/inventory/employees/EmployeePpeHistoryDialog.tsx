import type { InventoryEmployeeDto } from "../../../api/contracts";
import { Button, ModalShell } from "../../../shared/ui";
import { PpeMovementHistoryPanel } from "../PpeMovementHistoryPanel";

export function EmployeePpeHistoryDialog({ employee, onClose }: { employee: InventoryEmployeeDto; onClose: () => void }) {
  return <ModalShell title="История СИЗ сотрудника" subtitle={employee.fullName} className="inventory-employee-dialog inventory-employee-history" onClose={onClose}
    actions={<Button onClick={onClose} variant="primary">Закрыть</Button>}>
    <PpeMovementHistoryPanel key={employee.id} employeeId={employee.id} hideEmployee pageSize={12}
      title="Выдачи, возвраты и списания" emptyText="По этому сотруднику пока нет выдач, возвратов или списаний СИЗ." />
  </ModalShell>;
}
