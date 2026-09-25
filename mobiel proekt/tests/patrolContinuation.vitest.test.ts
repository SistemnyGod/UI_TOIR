import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({first:vi.fn(),all:vi.fn(),run:vi.fn(),receipt:vi.fn(),apply:vi.fn(),next:vi.fn(),sync:vi.fn()}));
vi.mock('@/api/mobileApi',()=>({getOutboxResult:mock.receipt}));
vi.mock('@/auth/dataOwnerContext',()=>({captureDataOwnerContext:async()=>({ownerUserId:'a',contourId:'test'}),assertDataOwnerContext:async()=>{}}));
vi.mock('@/db/database',()=>({getDatabase:async()=>({getFirstAsync:mock.first,getAllAsync:mock.all}),withProtectedExclusiveTransactionAsync:async (_db:unknown,action:(tx:{runAsync:typeof mock.run})=>Promise<void>)=>action({runAsync:mock.run})}));
vi.mock('@/db/repositories/outboxRepository',()=>({applyOutboxResponses:mock.apply}));
vi.mock('@/db/repositories/patrolSwitchRepository',()=>({continuePatrolAfterSwitchConflict:mock.next}));
vi.mock('@/sync/mutationSyncRequest',()=>({requestSyncAfterMutation:mock.sync}));
import {continuePatrolWithReconciliation} from '@/services/patrolContinuationService';
beforeEach(()=>{vi.resetAllMocks();mock.first.mockResolvedValueOnce(null).mockResolvedValueOnce({targetId:'b',status:'conflict'});mock.all.mockResolvedValue([{id:'attempted'}]);});
it('unknown receipt retains the barrier and never starts a new operation',async()=>{
 mock.receipt.mockRejectedValue(new Error('404'));
 await expect(continuePatrolWithReconciliation('a','switch')).rejects.toThrow('неизвестен');
 expect(mock.next).not.toHaveBeenCalled();expect(mock.apply).not.toHaveBeenCalled();expect(mock.sync).toHaveBeenCalledOnce();
});
it('restores a superseded attempted command after a missing receipt without changing its ID or payload',async()=>{
 mock.all.mockResolvedValue([{id:'attempted',status:'superseded'}]);mock.receipt.mockResolvedValue(null);mock.run.mockResolvedValue({changes:1});
 await expect(continuePatrolWithReconciliation('a','switch')).rejects.toThrow('неизвестен');
 expect(mock.run).toHaveBeenCalledWith(expect.stringContaining("status = 'retryLater'"), expect.arrayContaining(['a','test','attempted']));
 expect(mock.next).not.toHaveBeenCalled();
});
it('applies the receipt before continuing',async()=>{
 mock.receipt.mockResolvedValue({status:'accepted',clientOperationId:'attempted'});
 await continuePatrolWithReconciliation('a','switch');
 expect(mock.apply).toHaveBeenCalledOnce();expect(mock.next).toHaveBeenCalledWith('a','switch');
 expect(mock.apply.mock.invocationCallOrder[0]).toBeLessThan(mock.next.mock.invocationCallOrder[0]);
});
it('a second tap returns the durable continuation without another receipt or launch',async()=>{
 mock.first.mockReset().mockResolvedValue({id:'existing'});
 expect(await continuePatrolWithReconciliation('a','switch')).toBe('existing');
 expect(mock.receipt).not.toHaveBeenCalled();expect(mock.next).not.toHaveBeenCalled();
});
