import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OsmConnector } from '../src/scraper/connectors/osm.js';

/** Exposes the protected normalize() for unit testing. */
class TestableOsmConnector extends OsmConnector {
  public normalizePublic(raw: any) {
    return this.normalize(raw);
  }
}

const connector = new TestableOsmConnector();

test('normalizes a node with full address and contact tags', () => {
  const biz = connector.normalizePublic({
    type: 'node',
    id: 42,
    lat: 47.61,
    lon: -122.33,
    tags: {
      name: 'Downtown Bakery',
      shop: 'bakery',
      'addr:housenumber': '456',
      'addr:street': 'Oak Rd',
      'addr:city': 'Seattle',
      'contact:phone': '+1 206-555-0244',
      'contact:email': 'hi@bakery.test',
      opening_hours: 'Mo-Fr 08:00-17:00',
    },
  });

  assert.equal(biz.name, 'Downtown Bakery');
  assert.equal(biz.category, 'bakery');
  assert.equal(biz.address, '456 Oak Rd Seattle');
  assert.equal(biz.latitude, 47.61);
  assert.equal(biz.longitude, -122.33);
  assert.equal(biz.phone, '+1 206-555-0244');
  assert.equal(biz.email, 'hi@bakery.test');
  assert.equal(biz.hasWebsite, false);
  assert.equal(biz.scale, 'small'); // phone + opening hours
  assert.equal(biz.sourceRefId, 'osm-node-42');
  // Simulated review data stays inside the documented 'small' range.
  assert.ok(biz.reviewCount >= 10 && biz.reviewCount < 90);
  assert.ok(typeof biz.rating === 'number' && biz.rating >= 3.5 && biz.rating <= 5.0);
});

test('uses the center coordinates of ways and detects websites', () => {
  const biz = connector.normalizePublic({
    type: 'way',
    id: 7,
    center: { lat: 10.5, lon: 20.25 },
    tags: { name: 'Corner Garage', craft: 'car_repair', website: 'garage.test' },
  });
  assert.equal(biz.latitude, 10.5);
  assert.equal(biz.longitude, 20.25);
  assert.equal(biz.category, 'car_repair');
  assert.equal(biz.hasWebsite, true);
  assert.equal(biz.websiteUrl, 'garage.test');
  assert.equal(biz.address, 'Unknown Address');
  assert.equal(biz.scale, 'unknown');
  assert.equal(biz.reviewCount, 0);
  assert.equal(biz.rating, null);
  assert.equal(biz.sourceRefId, 'osm-way-7');
});
