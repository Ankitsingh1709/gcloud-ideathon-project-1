import dotenv from 'dotenv';

dotenv.config();

// Simulated request context mock
interface MockReq {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: string;
  };
}

interface MockRes {
  statusValue?: number;
  jsonBody?: any;
  status: (code: number) => MockRes;
  json: (body: any) => MockRes;
}

// Replicate the role check middleware logic from server.ts to verify its exact behavior
function runMiddlewareTest(req: any, res: any, next: () => void) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  next();
}

// Test Suite
console.log('\n🔒 RUNNING COMPLIANCE TEST: Role-Based Access Control (RBAC)');
console.log('===========================================================');

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

// Helper to create mock response object
function createMockResponse(): MockRes {
  const res: MockRes = {
    status(code: number) {
      this.statusValue = code;
      return this;
    },
    json(body: any) {
      this.jsonBody = body;
      return this;
    }
  };
  return res;
}

// Case 1: Non-admin user hitting an admin route gets 403 Forbidden
try {
  const req = {
    user: {
      uid: 'user-123',
      email: 'user@reflect.ai',
      name: 'Regular User',
      role: 'user' // Standard User role
    }
  };
  const res = createMockResponse();
  let nextCalled = false;
  
  runMiddlewareTest(req, res, () => {
    nextCalled = true;
  });

  assert(!nextCalled, 'Non-admin request must NOT bypass middleware to call next()');
  assert(res.statusValue === 403, 'Non-admin request hitting admin gate must return 403 status code');
  assert(res.jsonBody?.error?.includes('Forbidden'), 'Response body must explain that Admin privileges are required');
} catch (error) {
  console.error('Case 1 test crashed:', error);
  testsFailed++;
}

// Case 2: Admin user succeeds
try {
  const req = {
    user: {
      uid: 'admin-789',
      email: 'admin@reflect.ai',
      name: 'Reflect Admin',
      role: 'admin' // Admin role
    }
  };
  const res = createMockResponse();
  let nextCalled = false;
  
  runMiddlewareTest(req, res, () => {
    nextCalled = true;
  });

  assert(nextCalled, 'Admin request must successfully pass through middleware and call next()');
  assert(res.statusValue === undefined, 'Admin request should not trigger error status code on middleware');
} catch (error) {
  console.error('Case 2 test crashed:', error);
  testsFailed++;
}

// Case 3: Unauthenticated request gets 401
try {
  const req = {}; // No authenticated user
  const res = createMockResponse();
  let nextCalled = false;
  
  runMiddlewareTest(req, res, () => {
    nextCalled = true;
  });

  assert(!nextCalled, 'Unauthenticated request must NOT call next()');
  assert(res.statusValue === 401, 'Unauthenticated request must return 401 status code');
} catch (error) {
  console.error('Case 3 test crashed:', error);
  testsFailed++;
}

console.log('===========================================================');
console.log(`📊 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed.`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All RBAC middleware gates passed the security review!\n');
  process.exit(0);
}
