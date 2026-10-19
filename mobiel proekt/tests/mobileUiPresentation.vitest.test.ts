import { expect, it } from 'vitest';
import { getReportPrimaryAction } from '@/features/patrol/reportDeliveryPresentation';
import { lightColors, darkColors, toneColors } from '@/ui/atomTheme';

it.each([
  ['waiting_auth', 'signIn'], ['wrong_contour', 'serverSettings'], ['invalidPayload', 'repair'],
  ['conflict', 'repair'], ['accepted', 'done'], ['waiting_network', 'retry']
] as const)('keeps %s action ahead of readiness of a new report', (status, action) => {
  const result = getReportPrimaryAction(status, { ready: false, hasPointProblems: false });
  expect(result.action).toBe(action);
  expect(result.disabled).toBe(false);
  expect(result.buttonLabel).not.toBe('Открыть незаполненные');
});

it('uses one action for label and handler, blocks route-only problems and concurrent submission', () => {
  expect(getReportPrimaryAction(null, { ready: true, hasPointProblems: false })).toMatchObject({ action: 'submit', buttonLabel: 'Отправить отчёт', disabled: false });
  expect(getReportPrimaryAction(null, { ready: false, hasPointProblems: true })).toMatchObject({ action: 'openProblems', disabled: false });
  expect(getReportPrimaryAction(null, { ready: false, hasPointProblems: false })).toMatchObject({ action: 'openProblems', disabled: true });
  expect(getReportPrimaryAction('sending', { ready: true, hasPointProblems: false })).toMatchObject({ action: 'wait', disabled: true });
  expect(getReportPrimaryAction(null, { ready: true, hasPointProblems: false }, true).disabled).toBe(true);
});

function luminance(hex: string) {
  const values = hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}
it.each([['light', lightColors], ['dark', darkColors]] as const)('%s semantic text is readable on its surface', (_name, colors) => {
  for (const tone of ['neutral', 'success', 'warning', 'danger'] as const) {
    const pair = toneColors(colors, tone);
    expect(contrast(pair.foreground, pair.background), tone).toBeGreaterThanOrEqual(4.5);
  }
  for (const [foreground, background] of [[colors.text, colors.card], [colors.mutedText, colors.card], [colors.placeholder, colors.field], [colors.onPrimary, colors.primary], [colors.primary, colors.navBackground], [colors.primary, colors.backgroundAccent], [colors.disabledText, colors.disabled]]) {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
});
