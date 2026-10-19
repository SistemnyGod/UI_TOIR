let guard: { token: symbol; leave: (action: () => void) => void } | null = null;

/** The currently visible form owns tab navigation until its latest edit is saved. */
export function registerFormNavigationGuard(leave: (action: () => void) => void) {
  const token = Symbol('form');
  guard = { token, leave };
  return () => { if (guard?.token === token) guard = null; };
}

export function navigateAfterFormSave(action: () => void) {
  if (guard) guard.leave(action);
  else action();
}
