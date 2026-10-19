import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../src/outreach/templates.js';

test('substitutes all supported placeholders', () => {
  const out = renderTemplate('Hi {{ business_name }} ({{category}}) in {{  city  }}!', {
    business_name: 'Greenside Landscaping',
    business_category: 'gardener',
    business_city: 'Seattle',
  });
  assert.equal(out, 'Hi Greenside Landscaping (gardener) in Seattle!');
});

test('falls back to neutral wording when context is missing', () => {
  assert.equal(
    renderTemplate('{{ business_name }} / {{ category }} / {{ city }}', {}),
    'Business / industry / your area'
  );
});

test('converts literal \\n sequences from seed data into newlines', () => {
  assert.equal(renderTemplate('Hi there,\\n\\nThanks', {}), 'Hi there,\n\nThanks');
});

test('does not interpret $-patterns in business names', () => {
  // String.replace with a string replacement would expand "$&" etc.
  assert.equal(renderTemplate('Hello {{ business_name }}', { business_name: "Joe's $& Sons" }), "Hello Joe's $& Sons");
});

test('leaves unknown placeholders untouched', () => {
  assert.equal(renderTemplate('{{ owner_name }}', { business_name: 'X' }), '{{ owner_name }}');
});
