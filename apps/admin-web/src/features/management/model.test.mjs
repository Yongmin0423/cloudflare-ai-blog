import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryErrors, initialCategories, initialSettings, parseCategories, parseSettings, settingsErrors } from './model.ts';

test('category validation rejects duplicate name/slug, reserved name, and invalid order', () => {
  const valid = { id: 'new', name: '새 분류', slug: 'new-category', description: '', order: 4 };
  assert.deepEqual(categoryErrors(valid, initialCategories), []);
  assert.ok(categoryErrors({ ...valid, name: '블로그 운영' }, initialCategories).length);
  assert.ok(categoryErrors({ ...valid, slug: 'BLOGGING' }, initialCategories).length);
  for (const order of [0, 1000, 1.5, NaN]) assert.ok(categoryErrors({ ...valid, order }, []).length);
  assert.ok(categoryErrors({ ...valid, name: '미분류' }, []).length);
  assert.deepEqual(categoryErrors(initialCategories[0], initialCategories), []);
});
test('category storage rejects invalid and duplicate IDs without replacing saved data', () => {
  assert.deepEqual(parseCategories(JSON.stringify(initialCategories)), initialCategories);
  assert.deepEqual(parseCategories('[]'), []);
  for (const value of [null, {}, [{ id: 'a' }], [initialCategories[0], initialCategories[0]]]) assert.throws(() => parseCategories(JSON.stringify(value)));
});
test('settings validate required name, language, limits and stored structure', () => {
  assert.deepEqual(settingsErrors(initialSettings), []);
  assert.ok(settingsErrors({ ...initialSettings, name: '  ' }).length);
  assert.ok(settingsErrors({ ...initialSettings, language: 'xx' }).length);
  assert.ok(settingsErrors({ ...initialSettings, rules: 'a'.repeat(3001) }).length);
  assert.deepEqual(parseSettings(JSON.stringify(initialSettings)), initialSettings);
  for (const value of [null, {}, { ...initialSettings, topic: 3 }]) assert.throws(() => parseSettings(JSON.stringify(value)));
});
