import { it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
const state=vi.hoisted(()=>({owner:'a', db:null as unknown as DatabaseSync, changeOnWrite:false}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'id'}));
vi.mock('expo-sqlite',()=>({}));
vi.mock('@/auth/tokenStorage',()=>({getStoredOwnerUserId:async()=>state.owner}));
vi.mock('@/core/environments',()=>({currentContourId:'test'}));
vi.mock('@/db/repositories/filesRepository',()=>({insertLocalFileInTransaction:vi.fn()}));
vi.mock('@/db/repositories/outboxSql',()=>({insertOutboxCommandInTransaction:vi.fn()}));
vi.mock('@/sync/mutationSyncRequest',()=>({requestSyncAfterMutation:vi.fn()}));
vi.mock('@/db/database',()=>({
  getDatabase:async()=>state.db,
  withProtectedExclusiveTransactionAsync:async (_db:unknown, action:(tx:unknown)=>Promise<void>)=>{
    state.db.exec('BEGIN');
    try {
      await action({runAsync:async(sql:string,params:never[])=>{
        state.db.prepare(sql).run(...params);
        if(state.changeOnWrite)state.owner='b';
      }});
      state.db.exec('COMMIT');
    }catch(error){state.db.exec('ROLLBACK');throw error;}
  }
}));
import {saveWorkItems} from '@/db/repositories/workTaskRepository';
import {captureDataOwnerContext} from '@/auth/dataOwnerContext';
import type {WorkItemDto} from '@/domain/emu/emuTypes';
it('rolls back a real SQLite write if the account changes during the transaction',async()=>{
  state.owner='a';state.changeOnWrite=true;state.db=new DatabaseSync(':memory:');
  state.db.exec(`CREATE TABLE work_tasks(task_id TEXT PRIMARY KEY, owner_user_id TEXT, title TEXT,
    status TEXT, planned_at TEXT, revision INTEGER, completed_at_local TEXT, section_id TEXT,
    section_name TEXT, employee_id TEXT, employee_name TEXT, created_at_local TEXT, sync_status TEXT,
    item_kind TEXT, work_session_id TEXT, plan_task_id TEXT, description TEXT, approval_status TEXT,
    source TEXT, assigned_employees_json TEXT, actual_participants_json TEXT, attachments_json TEXT,
    capabilities_json TEXT, updated_at_server TEXT)`);
  try{
    const context=await captureDataOwnerContext();
    const item={itemId:'job', title:'Test', status:'inProgress', plannedAt:null, revision:1,
      sectionId:null, sectionName:null, kind:'workSession', workSessionId:'job', planTaskId:null,
      description:'', approvalStatus:'approved', source:'mobile', assignedEmployees:[],
      actualParticipants:[], attachments:[],capabilities:{}} as unknown as WorkItemDto;
    await expect(saveWorkItems([item],context)).rejects.toThrow('Устаревший');
    expect(state.db.prepare('SELECT COUNT(*) AS count FROM work_tasks').get()?.count).toBe(0);
    await expect(saveWorkItems([item],context)).rejects.toThrow('Устаревший');
  }finally{state.db.close();}
});
