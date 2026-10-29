import { afterEach, expect, test, vi } from 'vitest';
import { createRequestId } from './request-id.js';
afterEach(() => vi.restoreAllMocks());
test('utilise le générateur UUID natif disponible en HTTPS', () => {
  const native = vi.spyOn(crypto, 'randomUUID').mockReturnValue('known-native-uuid');
  expect(createRequestId()).toBe('known-native-uuid');
  expect(native).toHaveBeenCalledOnce();
});
test('repli HTTP : aléa cryptographique, bits de version/variante et identifiants distincts', () => {
  vi.spyOn(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  const values = vi.spyOn(crypto, 'getRandomValues');
  const ids = Array.from({ length: 100 }, () => createRequestId());
  expect(new Set(ids).size).toBe(100);
  expect(
    ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
    ),
  ).toBe(true);
  expect(values).toHaveBeenCalledTimes(100);
});
