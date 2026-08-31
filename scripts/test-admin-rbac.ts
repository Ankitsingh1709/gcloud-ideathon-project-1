/**
 * Security gate tests for the Express API.
 *
 * These import the REAL middleware out of server.ts rather than
 * reimplementing it, so the suite fails when the server changes. Run with
 * NODE_ENV=test (see package.json) so importing server.ts does not bind a port.
 */
import {
  requireAdminRole,
  rateLimitPerUser,
  extractByokKey,
  validateMessages,
  safeMessage,
  __resetRateLimit,
  trialQuota,
  trialRemainingFor,
  __resetTrialQuota,
  RATE_LIMIT_MAX,
  TRIAL_LIMIT,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
} from '../server';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ SUCCESS: ${message}`);
    testsPassed++;
  } else {
    console.log(`❌ FAILURE: ${message}`);
    testsFailed++;
  }
}

interface MockRes {
  statusValue?: number;
  jsonBody?: any;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (body: any) => MockRes;
  setHeader: (k: string, v: string) => void;
}

function createMockResponse(): MockRes {
  return {
    headers: {},
    status(code: number) { this.statusValue = code; return this; },
    json(body: any) { this.jsonBody = body; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
}

// Runs a middleware and reports whether it called next().
function run(mw: Function, req: any): { res: MockRes; nextCalled: boolean } {
  const res = createMockResponse();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

console.log('\n🔒 API SECURITY GATES');
console.log('===========================================================');

// --- requireAdminRole -------------------------------------------------------
{
  const { res, nextCalled } = run(requireAdminRole, {
    user: { uid: 'user-123', email: 'user@reflect.ai', role: 'user' }
  });
  assert(!nextCalled, 'Non-admin must NOT pass the admin gate');
  assert(res.statusValue === 403, 'Non-admin hitting an admin route gets 403');
  assert(res.jsonBody?.error?.includes('Forbidden'), 'The 403 body explains that admin privileges are required');
}

{
  const { res, nextCalled } = run(requireAdminRole, {
    user: { uid: 'admin-789', email: 'admin@reflect.ai', role: 'admin' }
  });
  assert(nextCalled, 'Admin passes the admin gate');
  assert(res.statusValue === undefined, 'Admin request sets no error status');
}

{
  const { res, nextCalled } = run(requireAdminRole, {});
  assert(!nextCalled, 'Unauthenticated request must NOT pass the admin gate');
  assert(res.statusValue === 401, 'Unauthenticated request gets 401');
}

// --- rateLimitPerUser -------------------------------------------------------
{
  __resetRateLimit();
  const req = { user: { uid: 'rate-test-user' } };

  let allowed = 0;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    if (run(rateLimitPerUser, req).nextCalled) allowed++;
  }
  assert(allowed === RATE_LIMIT_MAX, `First ${RATE_LIMIT_MAX} requests in the window are allowed`);

  const { res, nextCalled } = run(rateLimitPerUser, req);
  assert(!nextCalled, `Request ${RATE_LIMIT_MAX + 1} is blocked`);
  assert(res.statusValue === 429, 'An over-limit request gets 429');
  assert(Number(res.headers['Retry-After']) > 0, 'A 429 carries a positive Retry-After header');
}

{
  __resetRateLimit();
  // A separate uid must have its own budget — the limit is per user, not global.
  run(rateLimitPerUser, { user: { uid: 'noisy-user' } });
  const { nextCalled } = run(rateLimitPerUser, { user: { uid: 'quiet-user' } });
  assert(nextCalled, 'Rate limiting is per-user, not global');
}

{
  __resetRateLimit();
  const byokReq = { user: { uid: 'byok-user' }, byokKey: 'AIza' + 'x'.repeat(35) };
  let allowed = 0;
  for (let i = 0; i < RATE_LIMIT_MAX + 5; i++) {
    if (run(rateLimitPerUser, byokReq).nextCalled) allowed++;
  }
  assert(allowed === RATE_LIMIT_MAX + 5, 'A caller using their own key bypasses our quota limit');
}

{
  __resetRateLimit();
  const { res, nextCalled } = run(rateLimitPerUser, {});
  assert(!nextCalled && res.statusValue === 401, 'Rate limiter rejects an unauthenticated request');
}

// --- trialQuota -------------------------------------------------------------
{
  __resetTrialQuota();
  const req = { user: { uid: 'trial-user' } };

  let allowed = 0;
  for (let i = 0; i < TRIAL_LIMIT; i++) {
    if (run(trialQuota, req).nextCalled) allowed++;
  }
  assert(allowed === TRIAL_LIMIT, `The first ${TRIAL_LIMIT} generations are allowed`);

  const { res, nextCalled } = run(trialQuota, req);
  assert(!nextCalled, `Generation ${TRIAL_LIMIT + 1} is blocked`);
  assert(res.statusValue === 429, 'An exhausted trial gets 429');
  assert(
    res.jsonBody?.code === 'TRIAL_EXHAUSTED',
    'An exhausted trial is distinguishable from a burst rate limit'
  );
  assert(
    String(res.jsonBody?.error || '').includes('own Gemini API key'),
    'The exhausted-trial error tells the user how to continue'
  );
}

{
  __resetTrialQuota();
  const req = { user: { uid: 'counter-user' } };
  assert(trialRemainingFor('counter-user') === TRIAL_LIMIT, 'A new user starts with the full allowance');

  const { res } = run(trialQuota, req);
  assert(
    Number(res.headers['X-Trial-Remaining']) === TRIAL_LIMIT - 1,
    'Each generation reports the remaining allowance on the response'
  );
  assert(trialRemainingFor('counter-user') === TRIAL_LIMIT - 1, 'The counter decrements by one per generation');
}

{
  __resetTrialQuota();
  const byokReq = { user: { uid: 'byok-trial-user' }, byokKey: 'AIza' + 'x'.repeat(35) };
  let allowed = 0;
  for (let i = 0; i < TRIAL_LIMIT + 5; i++) {
    if (run(trialQuota, byokReq).nextCalled) allowed++;
  }
  assert(allowed === TRIAL_LIMIT + 5, 'A caller using their own key is not charged against the trial');
}

{
  __resetTrialQuota();
  run(trialQuota, { user: { uid: 'heavy-user' } });
  assert(trialRemainingFor('other-user') === TRIAL_LIMIT, 'The trial is per-user, not global');
}

{
  __resetTrialQuota();
  const { res, nextCalled } = run(trialQuota, {});
  assert(!nextCalled && res.statusValue === 401, 'Trial quota rejects an unauthenticated request');
}

// --- extractByokKey ---------------------------------------------------------
{
  const validKey = 'AIza' + 'a1b2c3d4e5f6'.padEnd(35, 'z');
  const req: any = { headers: { 'x-gemini-key': validKey } };
  run(extractByokKey, req);
  assert(req.byokKey === validKey, 'A well-formed legacy BYOK header is accepted');
}

{
  // The format this project's own key actually uses.
  const modernKey = 'AQ.Ab8' + 'a1b2c3'.padEnd(47, 'z');
  const req: any = { headers: { 'x-gemini-key': modernKey } };
  run(extractByokKey, req);
  assert(req.byokKey === modernKey, 'A modern AQ. BYOK header is accepted');
}

{
  const req: any = { headers: { 'x-gemini-key': 'not-a-real-key' } };
  run(extractByokKey, req);
  assert(req.byokKey === undefined, 'A malformed BYOK header is ignored, not trusted');
}

{
  const req: any = { headers: {} };
  const { nextCalled } = run(extractByokKey, req);
  assert(nextCalled && req.byokKey === undefined, 'No BYOK header falls through to the server key');
}

// --- validateMessages (input caps) ------------------------------------------
{
  assert(validateMessages(undefined) !== null, 'A missing messages array is rejected');
  assert(validateMessages('not an array') !== null, 'A non-array messages field is rejected');
  assert(validateMessages([{ role: 'user', content: 'hello' }]) === null, 'A normal conversation is accepted');

  const tooMany = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' }));
  assert(validateMessages(tooMany) !== null, `More than ${MAX_MESSAGES} messages is rejected`);

  const tooBig = [{ role: 'user', content: 'x'.repeat(MAX_TOTAL_CHARS + 1) }];
  assert(validateMessages(tooBig) !== null, `More than ${MAX_TOTAL_CHARS} total characters is rejected`);

  const atLimit = [{ role: 'user', content: 'x'.repeat(MAX_TOTAL_CHARS) }];
  assert(validateMessages(atLimit) === null, 'A payload exactly at the character limit is accepted');
}

// --- safeMessage (key redaction) --------------------------------------------
{
  // Google issues two key formats. Both must be redacted, and a miss here is
  // a real leak: the newer AQ. format was originally not matched at all.
  const legacyKey = 'AIza' + 'FAKE'.padEnd(35, '0');
  const modernKey = 'AQ.Ab8' + 'FAKE'.padEnd(47, '0');
  assert(legacyKey.length === 39, 'The legacy sample key has the real 39-character shape');
  assert(modernKey.length === 53, 'The modern sample key has the real 53-character shape');

  const modernScrubbed = safeMessage(new Error(`upstream rejected ${modernKey} at /v1beta`));
  assert(!modernScrubbed.includes(modernKey), 'A modern AQ. key is never echoed in an error message');
  assert(!modernScrubbed.includes('FAKE'), 'No fragment of a modern key survives redaction');

  const leaky = new Error(`request failed with key ${legacyKey} appended`);
  const scrubbed = safeMessage(leaky);
  assert(!scrubbed.includes(legacyKey), 'An API key is never echoed in an error message');
  assert(scrubbed.includes('REDACTED'), 'The redacted key is visibly marked');
  assert(safeMessage(null) === 'Unknown error', 'A null error degrades to a safe string');
}

console.log('===========================================================');
console.log(`📊 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed.`);

if (testsFailed > 0) {
  process.exit(1);
}
console.log('🎉 All API security gates passed.\n');
process.exit(0);
