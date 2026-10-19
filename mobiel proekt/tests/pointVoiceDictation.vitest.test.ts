import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  available: true, permission: { granted: true, canAskAgain: true }, offlineLocales: [] as string[], online: true,
  handlers: null as null | { onStart: () => void; onResult: (text: string, isFinal: boolean) => void; onError: (code: string) => void; onEnd: () => void },
  start: vi.fn(), stop: vi.fn(), abort: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@/services/speechRecognitionService', () => ({
  isSpeechRecognitionAvailable: () => speech.available,
  requestSpeechMicrophonePermission: async () => speech.permission,
  listOfflineSpeechLocales: async () => speech.offlineLocales,
  startSpeechRecognition: (options: unknown, handlers: typeof speech.handlers) => { speech.start(options); speech.handlers = handlers; return speech.unsubscribe; },
  stopSpeechRecognition: speech.stop,
  abortSpeechRecognition: speech.abort,
}));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => speech.online }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));

import { PointCommentField } from '@/features/patrol/PointCommentField';
import { appendDictatedText, dictationErrorHint, dictationHints, hasRussianLocale } from '@/features/patrol/pointVoiceDictation';

let screen: ReactTestRenderer | undefined;
let value = '';
const appended: string[] = [];
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  Object.assign(speech, { available: true, permission: { granted: true, canAskAgain: true }, offlineLocales: [], online: true, handlers: null });
  value = ''; appended.length = 0;
});
afterEach(async () => {
  if (screen) await act(async () => { screen!.unmount(); });
  screen = undefined;
});

function field(editable = true) {
  return React.createElement(PointCommentField, {
    value, editable, selectedStatus: 'issue', validationAttempted: false,
    onChangeText: () => undefined, onAppendText: (text: string) => { appended.push(text); value = appendDictatedText(value, text); }, onBlur: () => undefined,
  });
}
async function mount(editable = true) { await act(async () => { screen = create(field(editable)); }); }
const mic = () => screen!.root.findByProps({ testID: 'point-comment-voice' });
const texts = () => screen!.root.findAllByType('Text' as any).map(node => [node.props.children].flat().join(''));
async function tapMic() { await act(async () => { mic().props.onPress(); }); }

it('appends dictated words with one space and ignores empty phrases', () => {
  expect(appendDictatedText('', '  течь масла ')).toBe('течь масла');
  expect(appendDictatedText('Фланец', 'течь масла')).toBe('Фланец течь масла');
  expect(appendDictatedText('Фланец\n', 'течь')).toBe('Фланец\nтечь');
  expect(appendDictatedText('Фланец', '   ')).toBe('Фланец');
});

it('recognises Russian offline packs in any locale spelling', () => {
  expect(hasRussianLocale(['en-US', 'ru-RU'])).toBe(true);
  expect(hasRussianLocale(['ru_RU'])).toBe(true);
  expect(hasRussianLocale(['ru'])).toBe(true);
  expect(hasRussianLocale(['en-US', 'rw-RW'])).toBe(false);
});

it('maps recognizer errors to hints and keeps a user abort silent', () => {
  expect(dictationErrorHint('aborted')).toBeNull();
  expect(dictationErrorHint('not-allowed')).toBe(dictationHints.permissionDenied);
  expect(dictationErrorHint('service-not-allowed')).toBe(dictationHints.unavailable);
  expect(dictationErrorHint('network')).toBe(dictationHints.offline);
  expect(dictationErrorHint('language-not-supported')).toBe(dictationHints.offline);
  expect(dictationErrorHint('no-speech')).toBe(dictationHints.noSpeech);
  expect(dictationErrorHint('something-new')).toBe(dictationHints.failed);
});

it('dictates online in Russian, shows partial words and appends only the final phrase', async () => {
  await mount();
  expect(mic().props.accessibilityLabel).toBe('Диктовать описание голосом');
  await tapMic();
  expect(speech.start).toHaveBeenCalledExactlyOnceWith({ locale: 'ru-RU', onDevice: false });
  await act(async () => { speech.handlers!.onStart(); });
  expect(mic().props.accessibilityLabel).toBe('Остановить диктовку');
  await act(async () => { speech.handlers!.onResult('течь', false); });
  expect(texts()).toContain('течь…');
  expect(appended).toEqual([]);
  await act(async () => { speech.handlers!.onResult('течь масла на фланце', true); speech.handlers!.onEnd(); });
  expect(appended).toEqual(['течь масла на фланце']);
  expect(texts()).not.toContain('течь…');
  expect(speech.unsubscribe).toHaveBeenCalledOnce();
  expect(mic().props.accessibilityLabel).toBe('Диктовать описание голосом');
});

it('uses the installed offline pack on device without asking for network', async () => {
  speech.offlineLocales = ['ru-RU']; speech.online = false;
  await mount();
  await tapMic();
  expect(speech.start).toHaveBeenCalledExactlyOnceWith({ locale: 'ru-RU', onDevice: true });
});

it('offline without a Russian pack explains how to dictate instead of starting', async () => {
  speech.offlineLocales = ['en-US']; speech.online = false;
  await mount();
  await tapMic();
  expect(speech.start).not.toHaveBeenCalled();
  expect(texts()).toContain(dictationHints.offline);
});

it('a phone without a recognizer shows a hint and never asks for the microphone', async () => {
  speech.available = false;
  await mount();
  await tapMic();
  expect(speech.start).not.toHaveBeenCalled();
  expect(texts()).toContain(dictationHints.unavailable);
});

it.each([
  [true, dictationHints.permissionDenied],
  [false, dictationHints.permissionBlocked],
])('a denied microphone (can ask again: %s) shows the matching hint', async (canAskAgain, hint) => {
  speech.permission = { granted: false, canAskAgain };
  await mount();
  await tapMic();
  expect(speech.start).not.toHaveBeenCalled();
  expect(texts()).toContain(hint);
});

it('a network failure during recognition keeps the offline hint after the session ends', async () => {
  await mount();
  await tapMic();
  await act(async () => { speech.handlers!.onError('network'); speech.handlers!.onEnd(); });
  expect(texts()).toContain(dictationHints.offline);
  expect(appended).toEqual([]);
});

it('a second tap stops listening, and locking the field aborts dictation so late words are dropped', async () => {
  await mount();
  await tapMic();
  await act(async () => { speech.handlers!.onStart(); });
  await tapMic();
  expect(speech.stop).toHaveBeenCalledOnce();
  const handlers = speech.handlers!;
  await act(async () => { screen!.update(field(false)); });
  expect(speech.abort).toHaveBeenCalledOnce();
  expect(mic().props.disabled).toBe(true);
  await act(async () => { handlers.onResult('поздняя фраза', true); });
  expect(appended).toEqual([]);
});

it('unmount aborts a running recognizer', async () => {
  await mount();
  await tapMic();
  await act(async () => { screen!.unmount(); });
  screen = undefined;
  expect(speech.abort).toHaveBeenCalledOnce();
});
