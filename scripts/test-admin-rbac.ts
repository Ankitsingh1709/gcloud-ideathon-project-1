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
  RATE_LIMIT_MAX,
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

// --- extractByokKey ---------------------------------------------------------
{
  const validKey = 'AIza' + 'a1b2c3d4e5f6'.padEnd(35, 'z');
  const req: any = { headers: { 'x-gemini-key': validKey } };
  run(extractByokKey, req);
  assert(req.byokKey === validKey, 'A well-formed BYOK header is accepted');
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
  // Built rather than hardcoded so the length always matches the 39-char shape.
  const fakeKey = 'AIza' + 'FAKE'.padEnd(35, '0');
  const leaky = new Error(`request failed with key ${fakeKey} appended`);
  const scrubbed = safeMessage(leaky);
  assert(fakeKey.length === 39, 'The sample key has the real 39-character shape');
  assert(!scrubbed.includes(fakeKey), 'An API key is never echoed in an error message');
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
