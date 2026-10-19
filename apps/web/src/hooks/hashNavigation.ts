import { screenRegistry } from "../repositories/navigationRepository";
import { createClientUuid } from "../shared/clientUuid";
import type { NavigationGuardHost, PageNavigationGuard } from "../shared/navigation/NavigationGuardContext";
import type { ScreenId } from "../types";

const STATE_KEY = "__patrol360Navigation";
type Stamp = { epoch: string; index: number; key: string };
type Entry = Stamp & { url: string; screen: ScreenId; x: number; y: number };
type Transition = { commit: () => void; approved: boolean; restoring: boolean; restored: Promise<void>; release: () => void; guards: Set<PageNavigationGuard>; timer?: number };
export function screenFromHash(hash: string): ScreenId {
  const id = hash.replace(/^#/, "");
  return id === "assignment" ? "assign" : screenRegistry.some(screen => screen.id === id) ? id as ScreenId : "dashboard";
}

/** A blocked traversal returns to its original entry before asking; acceptance retries that traversal. */
export class HashNavigation implements NavigationGuardHost {
  private accepted: Entry;
  private observedIndex: number;
  private lastObserved: string;
  private guards = new Set<PageNavigationGuard>();
  private transition: Transition | null = null;
  private active = false;
  private approvedAction = false;
  constructor(private browser: Window, private onScreen: (screen: ScreenId) => void) {
    const stamp = this.stamp() ?? { epoch: createClientUuid(), index: 0, key: createClientUuid() };
    this.accepted = { ...stamp, url: browser.location.href, screen: screenFromHash(browser.location.hash), x: browser.scrollX, y: browser.scrollY };
    this.observedIndex = stamp.index;
    this.lastObserved = stamp.key + ":" + this.accepted.url;
  }
  registerGuard = (guard: PageNavigationGuard) => {
    this.guards.add(guard);
    return () => {
      this.guards.delete(guard);
      if (this.transition?.guards.has(guard)) { this.finishRestore(this.transition); this.transition = null; }
    };
  };
  start() {
    this.active = true; this.replace(this.accepted);
    this.browser.addEventListener("popstate", this.sync);
    this.browser.addEventListener("hashchange", this.sync);
    this.browser.addEventListener("scroll", this.rememberScroll, { passive: true });
    this.browser.document.addEventListener("click", this.link);
    return () => {
      this.active = false; if (this.transition) this.finishRestore(this.transition); this.transition = null;
      this.browser.removeEventListener("popstate", this.sync);
      this.browser.removeEventListener("hashchange", this.sync);
      this.browser.removeEventListener("scroll", this.rememberScroll);
      this.browser.document.removeEventListener("click", this.link);
    };
  }
  navigate = (next: ScreenId) => {
    if (!this.active || next === this.accepted.screen) return;
    const commit = () => {
      const entry = { epoch: this.accepted.epoch, index: this.accepted.index + 1, key: createClientUuid(), url: new URL(`#${next}`, this.browser.location.href).href, screen: next, x: 0, y: 0 };
      this.browser.history.pushState(this.state(entry), "", entry.url); this.accept(entry); this.transition = null;
    };
    this.requestLeave(commit);
  };
  requestLeave = (action: () => void) => {
    if (!this.active) return;
    if (this.approvedAction) { action(); return; }
    if (this.transition) return;
    const commit = () => { this.approvedAction = true; try { action(); } finally { this.approvedAction = false; this.transition = null; } };
    if (!this.blocked()) { commit(); return; }
    const transition = this.begin(commit); void this.authorize(transition);
  };
  private stamp(): Stamp | null {
    const value = this.browser.history.state?.[STATE_KEY];
    return value && typeof value.epoch === "string" && typeof value.key === "string" && Number.isSafeInteger(value.index) && value.index >= 0 ? value : null;
  }
  private state(stamp: Stamp) {
    const previous = this.browser.history.state;
    return { ...(previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {}), [STATE_KEY]: { epoch: stamp.epoch, index: stamp.index, key: stamp.key } };
  }
  private replace(entry: Entry) { this.browser.history.replaceState(this.state(entry), "", entry.url); }
  private blocked() { return [...this.guards].some(guard => guard.blocks()); }
  private same(entry: Entry) { return entry.key === this.accepted.key && entry.url === this.accepted.url; }
  private begin(commit: () => void): Transition {
    const transition: Transition = { commit, approved: false, restoring: false, restored: Promise.resolve(), release: () => {}, guards: new Set(this.guards) };
    this.transition = transition; return transition;
  }
  private async settled(transition: Transition) {
    while (this.active && this.transition === transition && transition.restoring) await transition.restored;
  }
  private async authorize(transition: Transition) {
    try {
      await this.settled(transition);
      for (const guard of [...this.guards].reverse()) {
        if (!this.active || this.transition !== transition) return;
        if (guard.blocks() && !await guard.confirm()) { await this.settled(transition); if (this.transition === transition) this.transition = null; return; }
      }
      await this.settled(transition);
      if (this.active && this.transition === transition) { transition.approved = true; transition.commit(); }
    } catch { if (this.transition === transition) this.transition = null; }
  }
  private accept(entry: Entry) { this.accepted = entry; this.observedIndex = entry.index; this.lastObserved = entry.key + ":" + entry.url; this.onScreen(entry.screen); }
  private rememberScroll = () => {
    if (this.browser.location.href === this.accepted.url && !this.transition?.restoring) { this.accepted.x = this.browser.scrollX; this.accepted.y = this.browser.scrollY; }
  };
  private finishRestore(transition: Transition) {
    if (transition.timer !== undefined) this.browser.clearTimeout(transition.timer);
    transition.timer = undefined; transition.restoring = false; transition.release();
  }
  private queueRestore(transition: Transition, delay = 0) {
    if (transition.timer !== undefined) return;
    transition.timer = this.browser.setTimeout(() => {
      transition.timer = undefined;
      if (!this.active || this.transition !== transition || !transition.restoring) return;
      const current = this.stamp();
      if (current?.key === this.accepted.key && this.browser.location.href === this.accepted.url) { this.finishRestore(transition); return; }
      const delta = current ? this.accepted.index - current.index : 0;
      if (delta) {
        this.browser.history.go(delta);
        // Coalesce repeated native traversals. Never queue overlapping relative corrections.
        this.queueRestore(transition, 100);
      } else { this.replace(this.accepted); this.lastObserved = this.accepted.key + ":" + this.accepted.url; this.finishRestore(transition); }
    }, delay);
  }
  private restore(transition: Transition, entry: Entry) {
    if (this.same(entry)) { this.finishRestore(transition); return; }
    if (!transition.restoring) { transition.restoring = true; transition.restored = new Promise(resolve => { transition.release = resolve; }); }
    this.queueRestore(transition);
  }
  private sync = () => {
    if (!this.active) return;
    let stamp = this.stamp();
    const append = !stamp || stamp.epoch !== this.accepted.epoch;
    if (append) {
      stamp = { epoch: this.accepted.epoch, index: this.observedIndex + 1, key: createClientUuid() };
      this.browser.history.replaceState(this.state(stamp), "");
    }
    const entry: Entry = { ...stamp!, url: this.browser.location.href, screen: screenFromHash(this.browser.location.hash), x: this.browser.scrollX, y: this.browser.scrollY };
    const identity = entry.key + ":" + entry.url;
    if (identity === this.lastObserved) return;
    this.lastObserved = identity;
    this.observedIndex = entry.index;
    if (this.transition?.approved) { this.accept(entry); this.transition = null; return; }
    if (this.same(entry)) {
      const transition = this.transition;
      if (transition?.restoring) { this.finishRestore(transition); this.browser.scrollTo(this.accepted.x, this.accepted.y); }
      return;
    }
    // A direct hash append can discard forward entries while a traversal is being restored.
    // Reuse the surviving position rather than inventing a new browser history entry.
    if (append && entry.index <= this.accepted.index) this.accepted = { ...this.accepted, index: entry.index };
    if (this.transition) { this.restore(this.transition, entry); return; }
    if (entry.screen === this.accepted.screen || !this.blocked()) { this.accept(entry); return; }
    const transition = this.begin(() => {
      const delta = entry.index - this.accepted.index;
      if (delta) this.browser.history.go(delta);
      else { this.replace(entry); this.accept(entry); this.transition = null; }
    });
    this.restore(transition, entry); void this.authorize(transition);
  };
  private link = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement) || target.hasAttribute("download") || target.target && target.target !== "_self") return;
    const next = new URL(target.href), current = this.browser.location;
    if (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search || !next.hash) return;
    const id = next.hash.slice(1);
    if (id !== "assignment" && !screenRegistry.some(screen => screen.id === id)) return;
    event.preventDefault(); this.navigate(screenFromHash(next.hash));
  };
}
