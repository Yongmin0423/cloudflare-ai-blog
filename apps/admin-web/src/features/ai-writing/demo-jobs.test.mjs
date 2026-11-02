import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceJob, retryJob, parseJobs, initialJobs, requestErrors } from './demo-jobs.ts';

test('sample request requires a short keyword and bounded instructions', () => {
  assert.ok(requestErrors('   ', '').length);
  assert.ok(requestErrors('a'.repeat(101), '').length);
  assert.ok(requestErrors('키워드', 'a'.repeat(2001)).length);
  assert.deepEqual(requestErrors('새 글', ''), []);
});
test('sample pipeline ends at review without publishing and retry resumes the failed step', () => {
  let job = { ...initialJobs[0], status: 'queued', step: 0 };
  job = advanceJob(job); assert.equal(job.status, 'running');
  for (let i = 0; i < 5; i++) job = advanceJob(job);
  assert.equal(job.status, 'review'); assert.equal(job.step, 5);
  assert.deepEqual(advanceJob(job), job);
  const failed = initialJobs[2]; const retried = retryJob(failed);
  assert.equal(retried.id, failed.id); assert.equal(retried.step, 4); assert.equal(retried.status, 'running');
  assert.equal(advanceJob(retried).status, 'review');
});
test('sample storage rejects corrupt states and duplicate IDs', () => {
  assert.deepEqual(parseJobs(JSON.stringify(initialJobs)), initialJobs);
  for (const value of [null, {}, [initialJobs[0], initialJobs[0]], [{ ...initialJobs[0], step: 2 }], [{ ...initialJobs[1], status: 'published' }]]) assert.throws(() => parseJobs(JSON.stringify(value)));
});
