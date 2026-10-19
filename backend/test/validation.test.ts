import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSortOrder,
  parsePagination,
  parseFiniteNumber,
  parseLatitude,
  parseLongitude,
  isUuid,
  isContactStatus,
  isBusinessScale,
  MAX_PAGE_SIZE,
} from '../src/lib/validation.js';

test('parseSortOrder accepts asc/desc case-insensitively', () => {
  assert.equal(parseSortOrder('asc'), 'asc');
  assert.equal(parseSortOrder('DESC'), 'desc');
  assert.equal(parseSortOrder(' Asc '), 'asc');
});

test('parseSortOrder rejects anything that could inject SQL', () => {
  assert.equal(parseSortOrder('desc; DROP TABLE businesses;--'), 'desc');
  assert.equal(parseSortOrder(['asc']), 'desc');
  assert.equal(parseSortOrder(undefined, 'asc'), 'asc');
});

test('parsePagination uses defaults for missing or invalid input', () => {
  assert.deepEqual(parsePagination(undefined, undefined), { limit: 20, page: 1, offset: 0 });
  assert.deepEqual(parsePagination('abc', '-3'), { limit: 20, page: 1, offset: 0 });
  assert.deepEqual(parsePagination('0', '0'), { limit: 20, page: 1, offset: 0 });
  assert.deepEqual(parsePagination('1.5', '2e3'), { limit: 20, page: 1, offset: 0 });
});

test('parsePagination computes offset and caps limit', () => {
  assert.deepEqual(parsePagination('10', '3'), { limit: 10, page: 3, offset: 20 });
  assert.equal(parsePagination('100000', '1').limit, MAX_PAGE_SIZE);
});

test('parseFiniteNumber only accepts real finite numbers', () => {
  assert.equal(parseFiniteNumber('12.5'), 12.5);
  assert.equal(parseFiniteNumber(-3), -3);
  assert.equal(parseFiniteNumber(''), null);
  assert.equal(parseFiniteNumber('  '), null);
  assert.equal(parseFiniteNumber('12abc'), null);
  assert.equal(parseFiniteNumber('Infinity'), null);
  assert.equal(parseFiniteNumber(NaN), null);
  assert.equal(parseFiniteNumber(null), null);
});

test('parseLatitude / parseLongitude enforce geographic ranges', () => {
  assert.equal(parseLatitude('47.6062'), 47.6062);
  assert.equal(parseLatitude('90.1'), null);
  assert.equal(parseLatitude(-91), null);
  assert.equal(parseLongitude('-122.3321'), -122.3321);
  assert.equal(parseLongitude('180'), 180);
  assert.equal(parseLongitude('181'), null);
});

test('isUuid recognises canonical UUIDs only', () => {
  assert.equal(isUuid('c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6'), true);
  assert.equal(isUuid('00000000-0000-0000-0000-000000000001'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid('1'), false);
  assert.equal(isUuid(42), false);
});

test('enum guards mirror schema.sql', () => {
  assert.equal(isContactStatus('in_sequence'), true);
  assert.equal(isContactStatus('spam'), false);
  assert.equal(isBusinessScale('medium'), true);
  assert.equal(isBusinessScale('huge'), false);
});
