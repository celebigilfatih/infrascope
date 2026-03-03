#!/usr/bin/env node
/**
 * Test Event Cache Implementation
 * Run: node scripts/test-event-cache.js
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8170';

async function testCache() {
  console.log('🧪 Testing Event Cache Implementation...\n');

  // Test 1: Check cache initialization
  console.log('Test 1: Checking cache initialization...');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const health = await response.json();
    console.log('✅ Health check:', health);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }

  // Test 2: Trigger manual alarm check
  console.log('\n\nTest 2: Triggering manual alarm check...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}/api/alarms/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const result = await response.json();
    
    console.log(`✅ Check completed in ${duration}s`);
    console.log('📊 Results:', {
      triggered: result.summary?.triggered || 0,
      errors: result.summary?.errors || 0,
      total: result.summary?.total || 0,
    });
    
    if (duration < 60) {
      console.log('✅ PERFORMANCE EXCELLENT: Under 60 seconds!');
    } else if (duration < 120) {
      console.log('✅ PERFORMANCE GOOD: Under 2 minutes');
    } else {
      console.log('⚠️  PERFORMANCE SLOW: Over 2 minutes');
    }
  } catch (error) {
    console.error('❌ Alarm check failed:', error.message);
  }

  // Test 3: Check database for cached events
  console.log('\n\nTest 3: Checking database for cached events...');
  console.log('Run this SQL query:');
  console.log(`
SELECT 
  logtype,
  COUNT(*) as event_count,
  MAX("eventTime") as latest_event,
  MIN("eventTime") as oldest_event
FROM "CachedEvent"
GROUP BY logtype
ORDER BY event_count DESC;
  `);

  // Test 4: Monitor logs for cache usage
  console.log('\n\nTest 4: Monitor logs for cache usage...');
  console.log('Watch for these patterns in docker-compose logs:');
  console.log('  - "[EventCache] Starting background sync job"');
  console.log('  - "[AlarmEngine] Using cache for {logtype}"');
  console.log('  - "[EventCache] ✅ Sync completed at"');
  console.log('\nRun: docker-compose logs -f web | grep -E "EventCache|AlarmEngine.*cache"');
}

testCache().catch(console.error);
