import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

/**
 * offline bootstrap script for Reflect.ai administrators
 * Uses Firebase Admin SDK to set the custom 'role' claim to 'admin'.
 * 
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts <uid> [role]
 */

const uid = process.argv[2];
const role = process.argv[3] || 'admin';

if (!uid) {
  console.error('\n❌ Error: User UID is required.');
  console.log('\nUsage:');
  console.log('  npx tsx scripts/bootstrap-admin.ts <UID> [role]');
  console.log('Example:');
  console.log('  npx tsx scripts/bootstrap-admin.ts q8zX9M3bH1...');
  process.exit(1);
}

// Ensure the role is valid
if (role !== 'admin' && role !== 'user') {
  console.error('❌ Error: Role must be either "admin" or "user".');
  process.exit(1);
}

async function run() {
  try {
    const authHelper = new GoogleAuth();
    const credentials = await authHelper.getCredentials();
    const projectId = await authHelper.getProjectId();
    const serviceAccountEmail = credentials.client_email || 'Default/App Engine/Compute Engine Default Service Account';

    console.log('===========================================================');
    console.log(`📡 SDK INITIALIZATION METADATA:`);
    console.log(`👉 Target GCP Project ID: "${projectId}"`);
    console.log(`👉 Service Account Email: "${serviceAccountEmail}"`);
    console.log('===========================================================');

    // Initialize Firebase Admin SDK
    initializeApp({
      projectId: projectId,
    });

    const authAdmin = getAuth();

    console.log(`\n🔑 Initializing claims update for UID: "${uid}"`);
    console.log(`👉 Setting custom claims: { role: "${role}" }`);

    await authAdmin.setCustomUserClaims(uid, { role });
    
    console.log('\n✅ Success! Custom claims updated successfully.');
    console.log(`User ${uid} has been assigned the role: "${role}"`);
    console.log('Note: The user must sign out and sign back in (or force a token refresh) for claims to take effect in their ID token.');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error applying claims:', error);
    process.exit(1);
  }
}

run();
