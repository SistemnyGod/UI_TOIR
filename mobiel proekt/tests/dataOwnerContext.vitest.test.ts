import {it, expect, vi} from 'vitest';
const state=vi.hoisted(()=>({owner:'a'}));
vi.mock('@/auth/tokenStorage',()=>({getStoredOwnerUserId:async()=>state.owner}));
vi.mock('@/core/environments',()=>({currentContourId:'test'}));
import {captureDataOwnerContext,assertDataOwnerContext} from '@/auth/dataOwnerContext';
import {advanceSessionGeneration} from '@/auth/sessionGeneration';
it('rejects responses after account change and returning to the same account',async()=>{
  const original=await captureDataOwnerContext();
  await expect(assertDataOwnerContext(original)).resolves.toBeUndefined();
  state.owner='b';
  await expect(assertDataOwnerContext(original)).rejects.toThrow('Устаревший');
  state.owner='a'; advanceSessionGeneration();
  await expect(assertDataOwnerContext(original)).rejects.toThrow('Устаревший');
});
