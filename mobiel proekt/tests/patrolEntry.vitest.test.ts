import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ selected: null as any, assignment: null as any, competing: null as any, accept: vi.fn(), start: vi.fn(), resume: vi.fn(), select: vi.fn(), swap: vi.fn() }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'o', contourId: 'c', generation: 0 }), assertDataOwnerContext: async () => {} }));
vi.mock('@/db/database', () => ({ getDatabase: async () => ({ getFirstAsync: async () => s.competing }) }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ selectPatrolForContext: s.select, getPatrolDeviceContext: async () => ({ assignmentId: s.selected?.assignmentId ?? null }) }));
vi.mock('@/db/repositories/patrolSwitchRepository', () => ({ switchPatrolLocally: s.swap }));
vi.mock('@/db/repositories/patrolRepository', () => ({
  getAssignmentById: async () => s.selected,
  getAssignmentByRequestId: async () => s.assignment,
  getRequestBoardItem: async () => ({ performerSelectionAvailable: true }),
  acceptRequestLocally: s.accept, startAssignmentLocally: s.start, resumeAssignmentLocally: s.resume,
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: false })
}));
import { enterPatrolRequest } from '@/services/patrolEntryService';
beforeEach(() => { vi.clearAllMocks(); s.selected = null; s.assignment = null; s.competing = null;
  s.accept.mockImplementation(async () => { s.assignment = { assignmentId: 'b', status: 'accepted', employeeId: 'bob' }; return { assignment: s.assignment }; });
  s.start.mockImplementation(async () => ({ ...s.assignment, status: 'inProgress' }));
});
it('retries only start after acceptance survived a failed start', async () => {
  s.start.mockRejectedValueOnce(new Error('disk'));
  await expect(enterPatrolRequest('request', 'bob')).rejects.toThrow('disk');
  expect(await enterPatrolRequest('request', 'bob')).toContain('/b/scan-nfc');
  expect(s.accept).toHaveBeenCalledTimes(1);
});
it('uses the atomic switch when the target employee already has a running route without a global selection', async () => {
  s.assignment = { assignmentId: 'b', status: 'accepted', employeeId: 'bob' };
  s.competing = { assignmentId: 'a' };
  await enterPatrolRequest('request', 'bob');
  expect(s.swap).toHaveBeenCalledWith('a', 'b', expect.any(Function));
  expect(s.start).not.toHaveBeenCalled();
});
it('opens a running route without another lifecycle command', async () => {
  s.assignment = { assignmentId: 'b', status: 'inProgress', employeeId: 'bob' };
  await enterPatrolRequest('request', 'bob');
  expect(s.start).not.toHaveBeenCalled();
  expect(s.select).toHaveBeenCalled();
});
it('coalesces double taps', async () => {
  await Promise.all([enterPatrolRequest('request', 'bob'), enterPatrolRequest('request', 'bob')]);
  expect(s.start).toHaveBeenCalledTimes(1);
});
it('changing employees uses normal start validation and does not silently pause their other route', async () => {
  s.selected = { assignmentId: 'alice-running', employeeId: 'alice' }; s.competing = { assignmentId: 'bob-running' };
  s.start.mockRejectedValueOnce(new Error('У сотрудника уже выполняется обход'));
  await expect(enterPatrolRequest('request', 'bob')).rejects.toThrow('уже выполняется');
  expect(s.swap).not.toHaveBeenCalled(); expect(s.select).not.toHaveBeenCalled();
});
it('a completed start after leaving the selector does not overwrite device selection', async () => {
  let active = true;
  s.start.mockImplementationOnce(async () => { active = false; });
  await expect(enterPatrolRequest('request', 'bob', () => active)).rejects.toThrow('закрыт');
  expect(s.select).not.toHaveBeenCalled();
});
