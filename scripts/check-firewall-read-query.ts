import assert from 'node:assert/strict';
import {
  firewallListQueryFromUrl,
  paginateFirewallItems,
} from '../lib/firewall/read-query';

const bounded = firewallListQueryFromUrl(
  'http://localhost/api/firewalls/one/policies?page=2&limit=999&search=%20CORE%20&action=ACCEPT&unknown=drop',
  ['action']
);
assert.equal(bounded.page, 2);
assert.equal(bounded.limit, 100);
assert.equal(bounded.search, 'core');
assert.deepEqual(bounded.filters, { action: 'accept' });

const defaults = firewallListQueryFromUrl(
  'http://localhost/api/firewalls/one/policies?page=-1&limit=zero'
);
assert.equal(defaults.page, 1);
assert.equal(defaults.limit, 50);

const result = paginateFirewallItems({
  items: [
    { id: 1, name: 'Core allow', action: 'accept' },
    { id: 2, name: 'Core deny', action: 'deny' },
    { id: 3, name: 'Branch allow', action: 'accept' },
  ],
  query: {
    page: 1,
    limit: 1,
    search: 'core',
    filters: { action: 'accept' },
  },
  searchText: (item) => `${item.name} ${item.id}`,
  filter: (item, filters) => item.action === filters.action,
});
assert.deepEqual(result.items.map((item) => item.id), [1]);
assert.deepEqual(result.pagination, {
  page: 1,
  limit: 1,
  total: 1,
  hasMore: false,
});

console.log('Firewall list query and pagination checks passed.');
