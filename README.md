# AI Journal & Reflections — Production Deployment Guide

An elegant, secure, and user-isolated full-stack journaling application. Users write private reflections, converse with Gemini, and maintain a historical catalog of their logs, fully protected by row-level database rules.

---

## Technical Architecture Overview

* **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons.
* **Backend API Proxy:** Express (NodeJS) running behind Vite SPA middleware in development, and serving production bundles in Cloud Run.
* **AI Engine:** Gemini 2.5 Flash API wrapped in a resilient server-side fallback loop.
* **Identity & Database:** Firebase Authentication (Google Sign-In) paired with a user-isolated Cloud Firestore database.

---

## Local Configuration

All API keys are securely managed server-side.

1. Ensure `.env` is populated with your Gemini key:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```
2. Start the full-stack server locally:
   ```bash
   npm run dev
   ```

---

## Production Security & Deployment Checklist

Follow these exact guidelines to safely deploy to Google Cloud Run and Firebase.

### 1. Firestore Security Rules

Ensure your database is isolated strictly to authenticated users. Deploy the following rules inside your Firebase console or using the CLI:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/entries/{entryId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 2. Google Cloud Secret Manager Setup

To keep your Gemini API Key secure, create a secret in Secret Manager and grant your Cloud Run compute service account access:

```bash
# 1. Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 2. Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Containerized Deployment to Cloud Run

Deploy the container using the pre-configured build system. Run the following command in your terminal:

```bash
gcloud run deploy ai-journal-reflections \
  --source . \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --allow-unauthenticated \
  --region=us-central1
```

### 4. Campaign Verification Resource Label

Apply the mandatory label to successfully register this service for automated challenge verification:

```bash
gcloud run services update ai-journal-reflections \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## User Verification & Walkthrough Guide

To verify complete functional stability, execute the following test scenarios:

### Case 1: Secured Identity & Sign-In Workflow
1. Navigate to the application landing page.
2. Verify you are prompted with an elegant landing card and a "Sign In with Google" button.
3. Click "Sign In with Google". Once authenticated, verify you are taken directly to the private workspace.

### Case 2: Multi-turn Reflection Conversing
1. Inside the workspace, type a reflection prompt: *"I am feeling a bit overwhelmed with work today."* and press send.
2. Verify that:
   * The user's input is instantly saved in Firestore under the user's ID as a draft.
   * Gemini responds with empathetic, reflective advice.
   * The active conversation UI renders the response in real-time.

### Case 3: AI Reflection Summary & Catalog
1. Click the **Synthesize & Catalog** button in the left insights sidebar.
2. Verify that Gemini analyzes the conversation and updates the:
   * Generated entry title.
   * Mood tag (e.g., "Melancholy" or "Overwhelmed").
   * Entry category (e.g., "Work").
   * Concise summary box.
3. Verify that the entry moves from "Draft" status to "Saved" in your sidebar archive.

### Case 4: Private Row-Level Isolation (Auth Isolation)
1. Sign out of the account.
2. Authenticate using a different Google profile.
3. Verify that the previous user's reflections do not load in the sidebar history, confirming absolute user isolation and zero data leakage.
