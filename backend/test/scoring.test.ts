import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpportunityScore } from '../src/lib/scoring.js';

test('no website and highly rated, busy business scores highest', () => {
  assert.equal(calculateOpportunityScore({ hasWebsite: false, reviewCount: 120, rating: 4.6 }), 80);
});

test('website present removes the 50-point bonus', () => {
  assert.equal(calculateOpportunityScore({ hasWebsite: true, reviewCount: 120, rating: 4.6 }), 30);
});

test('moderate activity earns 15 points', () => {
  assert.equal(calculateOpportunityScore({ hasWebsite: false, reviewCount: 25, rating: 3.2 }), 65);
  // Many reviews but low rating falls back to the moderate tier.
  assert.equal(calculateOpportunityScore({ hasWebsite: false, reviewCount: 80, rating: 3.9 }), 65);
});

test('missing rating and few reviews only scores the website bonus', () => {
  assert.equal(calculateOpportunityScore({ hasWebsite: false, reviewCount: 3, rating: null }), 50);
  assert.equal(calculateOpportunityScore({ hasWebsite: true, reviewCount: 0 }), 0);
});

test('thresholds are strict (> not >=)', () => {
  assert.equal(calculateOpportunityScore({ hasWebsite: true, reviewCount: 50, rating: 4.5 }), 15);
  assert.equal(calculateOpportunityScore({ hasWebsite: true, reviewCount: 51, rating: 4.0 }), 15);
  assert.equal(calculateOpportunityScore({ hasWebsite: true, reviewCount: 10, rating: 5 }), 0);
});
