import assert from 'node:assert/strict';
import {
  AUTH_RATE_LIMIT,
  GENERAL_RATE_LIMIT,
  getRateLimitConfig,
  isRateLimited,
} from '../lib/rate-limit';

const originalNow = Date.now;
let now = originalNow();
Date.now = () => now;

try {
  const ip = '198.51.100.241';
  for (let index = 0; index < 20; index++) {
    assert.equal(isRateLimited(ip, getRateLimitConfig('/api/dashboard/summary')).limited, false);
    assert.equal(isRateLimited(ip, getRateLimitConfig('/api/auth/me')).limited, false);
  }

  for (let index = 0; index < AUTH_RATE_LIMIT.maxRequests; index++) {
    assert.equal(isRateLimited(ip, getRateLimitConfig('/api/auth/login')).limited, false,
      'ordinary API and session reads must not consume the login budget');
  }

  const blocked = isRateLimited(ip, AUTH_RATE_LIMIT);
  assert.equal(blocked.limited, true, 'excessive login attempts must still be blocked');
  assert.equal(blocked.retryAfterMs, AUTH_RATE_LIMIT.windowMs);
  assert.equal(isRateLimited(ip, GENERAL_RATE_LIMIT).limited, false,
    'blocked login attempts must not block ordinary API requests');
  assert.equal(isRateLimited('198.51.100.242', AUTH_RATE_LIMIT).limited, false,
    'different clients must have separate login budgets');

  now += AUTH_RATE_LIMIT.windowMs;
  assert.equal(isRateLimited(ip, AUTH_RATE_LIMIT).limited, false,
    'login access must recover once the window expires');

  const generalIp = '198.51.100.243';
  for (let index = 0; index < GENERAL_RATE_LIMIT.maxRequests; index++) {
    assert.equal(isRateLimited(generalIp, GENERAL_RATE_LIMIT).limited, false);
  }
  assert.equal(isRateLimited(generalIp, GENERAL_RATE_LIMIT).limited, true);
  assert.equal(isRateLimited(generalIp, AUTH_RATE_LIMIT).limited, false,
    'even an exhausted general API budget must not prevent the first login');
  assert.equal(getRateLimitConfig('/api/auth/reset-password'), AUTH_RATE_LIMIT);

  console.log('Login rate-limit checks passed.');
} finally {
  Date.now = originalNow;
}
