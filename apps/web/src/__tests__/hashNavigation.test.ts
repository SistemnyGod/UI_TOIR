import { afterEach, describe, expect, it, vi } from "vitest";
import { HashNavigation, screenFromHash } from "../hooks/hashNavigation";

function decision() { let resolve!: (allowed: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { resolve, promise }; }
async function flush() { await new Promise(resolve => setTimeout(resolve, 10)); }
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); document.body.innerHTML = ""; vi.restoreAllMocks(); });
function fixture() {
  const entries: Array<{ url: string; state: unknown }> = [{ url: "http://localhost:3000/#dashboard", state: { existing: "kept" } }]; let position = 0;
  const events = new EventTarget(), traversals: number[] = [], changed = vi.fn();
  const browser = { location: new URL(entries[0].url), scrollX: 0, scrollY: 0, scrollTo: vi.fn(), document, setTimeout, clearTimeout,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    history: {
      get state() { return entries[position].state; }, get length() { return entries.length; },
      replaceState(state: unknown, _unused: string, url?: string) { entries[position] = { state, url: url ? new URL(url, browser.location).href : entries[position].url }; browser.location = new URL(entries[position].url); },
      pushState(state: unknown, _unused: string, url: string) { entries.splice(position + 1); entries.push({ state, url: new URL(url, browser.location).href }); position++; browser.location = new URL(entries[position].url); },
      go(delta: number) { traversals.push(delta); queueMicrotask(() => { const next = position + delta; if (next < 0 || next >= entries.length) return; position = next; browser.location = new URL(entries[position].url); events.dispatchEvent(new Event("popstate")); events.dispatchEvent(new Event("hashchange")); }); },
    },
  };
  const navigation = new HashNavigation(browser as unknown as Window, changed); stops.push(navigation.start());
  return { navigation, browser, changed, entries, traversals, get position() { return position; }, appendHash: (hash: string) => { browser.history.pushState(null, "", hash); events.dispatchEvent(new Event("popstate")); events.dispatchEvent(new Event("hashchange")); } };
}
describe("guarded hash navigation", () => {
  it("retains existing history state, normalizes the alias and does not push the current screen twice", () => {
    const f = fixture(); expect(screenFromHash("#assignment")).toBe("assign"); expect(screenFromHash("#unknown")).toBe("dashboard"); f.navigation.navigate("results"); f.navigation.navigate("results"); expect(f.entries).toHaveLength(2); expect(f.browser.history.state).toMatchObject({ existing: "kept" }); expect(f.changed).toHaveBeenLastCalledWith("results");
  });
  it("holds the original route until approval and ignores repeated transition attempts", async () => {
    const f = fixture(), gate = decision(), confirm = vi.fn(() => gate.promise); f.navigation.registerGuard({ blocks: () => true, confirm }); f.navigation.navigate("results"); f.navigation.navigate("routes"); await flush(); expect(confirm).toHaveBeenCalledOnce(); expect(f.browser.location.hash).toBe("#dashboard"); gate.resolve(false); await flush(); expect(f.entries).toHaveLength(1);
    confirm.mockReturnValue(Promise.resolve(true)); f.navigation.navigate("results"); await flush(); expect(f.browser.location.hash).toBe("#results"); expect(f.entries).toHaveLength(2);
  });
  it("restores the browser entry before asking and cancels without creating extra entries", async () => {
    const f = fixture(); f.navigation.navigate("results"); f.navigation.navigate("inventory-ppe-create"); const gate = decision(), confirm = vi.fn(() => gate.promise); f.navigation.registerGuard({ blocks: () => true, confirm }); f.browser.history.go(-1); await flush();
    expect(f.browser.location.hash).toBe("#inventory-ppe-create"); expect(f.traversals).toEqual([-1, 1]); expect(confirm).toHaveBeenCalledOnce(); expect(f.entries).toHaveLength(3); gate.resolve(false); await flush(); expect(f.position).toBe(2); expect(f.changed).toHaveBeenLastCalledWith("inventory-ppe-create");
  });
  it("retries an approved Back traversal once and preserves Forward", async () => {
    const f = fixture(); f.navigation.navigate("results"); f.navigation.navigate("inventory-ppe-create"); const confirm = vi.fn(async () => true), remove = f.navigation.registerGuard({ blocks: () => true, confirm }); f.browser.history.go(-1); await flush(); expect(f.browser.location.hash).toBe("#results"); expect(f.traversals).toEqual([-1, 1, -1]); expect(confirm).toHaveBeenCalledOnce(); expect(f.entries).toHaveLength(3); remove(); f.browser.history.go(1); await flush(); expect(f.browser.location.hash).toBe("#inventory-ppe-create");
  });
  it("handles a direct hash append with one question, preserving the old route on cancellation", async () => {
    const f = fixture(), gate = decision(), confirm = vi.fn(() => gate.promise); f.navigation.registerGuard({ blocks: () => true, confirm }); f.appendHash("#results"); await flush(); expect(f.browser.location.hash).toBe("#dashboard"); expect(confirm).toHaveBeenCalledOnce(); expect(f.traversals).toEqual([-1]); gate.resolve(false); await flush(); expect(f.entries).toHaveLength(2); expect(f.position).toBe(0);
  });
  it("does not ask twice when Back is pressed again while a decision is open", async () => {
    const f = fixture(); f.navigation.navigate("results"); f.navigation.navigate("inventory-ppe-create"); const gate = decision(), confirm = vi.fn(() => gate.promise); f.navigation.registerGuard({ blocks: () => true, confirm }); f.browser.history.go(-1); await flush(); f.browser.history.go(-1); await flush(); expect(confirm).toHaveBeenCalledOnce(); expect(f.browser.location.hash).toBe("#inventory-ppe-create"); gate.resolve(false); await flush(); expect(f.position).toBe(2);
  });
  it("cancels a pending decision on owner removal and cannot redirect the new owner with a late answer", async () => {
    const f = fixture(), gate = decision(); const remove = f.navigation.registerGuard({ blocks: () => true, confirm: () => gate.promise }); f.navigation.navigate("results"); await flush(); remove(); f.navigation.navigate("routes"); gate.resolve(true); await flush(); expect(f.browser.location.hash).toBe("#routes"); expect(f.changed).not.toHaveBeenCalledWith("results");
  });
  it("ignores a duplicate popstate/hashchange pair and keeps a blocked pending save in place", async () => {
    const f = fixture(); f.navigation.navigate("results"); f.navigation.navigate("inventory-ppe-create"); const confirm = vi.fn(() => false); f.navigation.registerGuard({ blocks: () => true, confirm }); f.browser.history.go(-1); await flush(); expect(confirm).toHaveBeenCalledOnce(); expect(f.traversals).toEqual([-1, 1]); expect(f.browser.location.hash).toBe("#inventory-ppe-create");
  });
  it("coalesces a burst of Back traversals even when forward entries still exist", async () => {
    const f = fixture(); f.navigation.navigate("results"); f.navigation.navigate("inventory-ppe-create"); f.navigation.navigate("routes"); f.navigation.navigate("employees"); f.browser.history.go(-2); await flush();
    const gate = decision(), confirm = vi.fn(() => gate.promise); f.navigation.registerGuard({ blocks: () => true, confirm }); f.browser.history.go(-1); f.browser.history.go(-1); await flush();
    expect(f.position).toBe(2); expect(f.browser.location.hash).toBe("#inventory-ppe-create"); expect(confirm).toHaveBeenCalledOnce(); gate.resolve(false); await flush(); expect(f.position).toBe(2); expect(f.entries).toHaveLength(5);
  });
  it("guards a callback which navigates without showing a second confirmation", async () => {
    const f = fixture(), confirm = vi.fn(async () => true); f.navigation.registerGuard({ blocks: () => true, confirm }); f.navigation.requestLeave(() => f.navigation.navigate("results")); await flush(); expect(confirm).toHaveBeenCalledOnce(); expect(f.browser.location.hash).toBe("#results");
  });
});
