const selector = [
  'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', 'a[href]', '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function availableFocusTarget(element: HTMLElement) {
  if (element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
  const closedDetails = element.closest('details:not([open])');
  if (closedDetails && !closedDetails.querySelector('summary')?.contains(element)) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter(element => element.tabIndex >= 0 && availableFocusTarget(element));
}
