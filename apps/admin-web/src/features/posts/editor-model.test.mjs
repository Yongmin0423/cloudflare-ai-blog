import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFields, emptyContent, isWebUrl, makeSlug, parseLocalDraft, validateFields, validateContent } from './editor-model.ts';

test('slug generation supports Korean and normalizes separators', () => {
  assert.equal(makeSlug('  첫 번째 글!  '), '첫-번째-글');
  assert.equal(makeSlug('Hello --- World'), 'hello-world');
});
test('draft validation catches required fields and invalid cover metadata', () => {
  assert.equal(validateFields(emptyFields).length, 2);
  const valid = { ...emptyFields, title: '제목', slug: '제목' };
  assert.deepEqual(validateFields(valid), []);
  assert.equal(validateFields({ ...valid, coverUrl: 'javascript:alert(1)' }).length, 2);
  assert.equal(validateFields({ ...valid, coverUrl: 'https://example.com/a.png' }).length, 1);
});
test('URLs reject executable schemes, credentials and malformed input', () => {
  assert.equal(isWebUrl('https://example.com/image.png'), true);
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,abc', '//example.com/a', 'https://user:pass@example.com']) assert.equal(isWebUrl(url), false);
});
test('stored JSON round trips and rejects corrupt or unsupported drafts', () => {
  const record = { version: 1, fields: emptyFields, content: emptyContent, savedAt: '2026-11-02T00:00:00Z' };
  assert.deepEqual(parseLocalDraft(JSON.stringify(record)), record);
  for (const item of [null, {}, { ...record, version: 2 }, { ...record, fields: { title: 123 } }, { ...record, content: { type: 'script' } }]) assert.throws(() => parseLocalDraft(JSON.stringify(item)));
  assert.throws(() => parseLocalDraft('{broken'));
});
test('body image and link validation rejects unsafe attributes', () => {
  assert.equal(validateContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/a.png', alt: '설명' } }] }).length, 0);
  assert.equal(validateContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/a.png', alt: '' } }] }).length, 1);
  assert.equal(validateContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }).length, 1);
});
