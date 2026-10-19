import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractContactEmail, normalizeWebsiteUrl } from '../src/scraper/email.js';

test('finds a contact email in page HTML', () => {
  const html = '<footer>Contact: <a href="mailto:Info@GreensideLandscaping.com">email us</a></footer>';
  assert.equal(extractContactEmail(html), 'info@greensidelandscaping.com');
});

test('skips retina asset names and placeholder domains', () => {
  const html = `
    <img src="/img/logo@2x.png">
    <img src="/img/hero@3x.webp">
    <p>you@example.com</p>
    <svg xmlns="http://www.w3.org/2000/svg"></svg> foo@w3.org
    <script>dsn: "abc@o123.ingest.sentry.io"</script>
    <p>hello@bakery.co.uk.</p>`;
  assert.equal(extractContactEmail(html), 'hello@bakery.co.uk');
});

test('returns null when there is no usable address', () => {
  assert.equal(extractContactEmail('<p>No contact here</p>'), null);
  assert.equal(extractContactEmail('<img src="icon@2x.png">'), null);
});

test('normalizeWebsiteUrl adds a protocol only when missing', () => {
  assert.equal(normalizeWebsiteUrl(' bakery.com '), 'http://bakery.com');
  assert.equal(normalizeWebsiteUrl('https://bakery.com'), 'https://bakery.com');
  assert.equal(normalizeWebsiteUrl('HTTP://bakery.com'), 'HTTP://bakery.com');
});
