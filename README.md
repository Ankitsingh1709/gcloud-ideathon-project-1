# Reflect.ai — a private AI journal that remembers what you meant

**Live demo:** _<!-- TODO: paste the Cloud Run URL here after deploying -->_
**Stack:** React 19 · Express · Firebase Auth · Cloud Firestore · Gemini · Cloud Run

Reflect.ai is a journaling application built on the Cloud Run AI challenge baseline
and taken well past it. You speak or type a reflection, Gemini answers as it streams,
and every catalogued entry is embedded so you can later ask *"when have I felt like
this before?"* and get your own past back — ranked by meaning, not keywords.

The design constraint throughout was that a journal is the most private thing a
person will put in a database. Several decisions below cost features on purpose.

---

## What we built beyond the starter lab

| Feature | Why it is not a template feature |
|---|---|
| **Semantic memory search** | Every catalogued entry is embedded with `gemini-embedding-001` (768-dim, L2-normalized). A query is embedded at search time and ranked by cosine similarity against vectors already in memory — no vector database, no extra Firestore reads. |
| **Streaming reflections (SSE)** | `generateContentStream` over Server-Sent Events. `EventSource` cannot send an `Authorization` header, so the stream is read off `fetch`'s `ReadableStream` and parsed by hand. Falls back to the non-streaming route only if nothing reached the screen. |
| **Voice journaling** | Native Web Speech API — no dependency, no audio ever uploaded. The browser transcribes; only text leaves the device. The control is feature-detected and hidden where unsupported. |
| **Week in review** | Gemini reads only entry *metadata* (date, title, one-line summary, mood, category) from the last seven days and writes back a short letter about your patterns. The period is sent to the server and named in the prompt, so the letter can never claim to describe "this week" while holding the whole archive. Switchable to all-time. |
| **Bring-your-own-key** | Optionally use your own Gemini key. Stored in `localStorage` only, never in Firestore, sent only as a header on your own requests. |
| **Location-tagged entries** | One-tap live location via the native Geolocation API (with accuracy readout), plus a Google Maps picker and manual entry. Coordinate validation is enforced in Firestore rules, not just the UI. Live location works even when the map cannot load. |
| **Insights dashboard** | Client-side mood trends, streaks, and category distribution over entries already in memory — no additional queries. |
| **Admin RBAC** | Custom-claim roles verified server-side, scoped to operational metadata only (see below). |

---

## Google Cloud services used

Confirmed against the submission form:

- **User authentication via Firebase** — Google SSO. ID tokens are verified server-side against Google's JWKS endpoint (`jsonwebtoken` + `jwks-rsa`) with issuer and audience pinned.
- **Multi-turn interaction with the Gemini API** — full conversation history is replayed on every turn, streaming and non-streaming.
- **User-isolated Firestore document storage** — `users/{uid}/entries/{entryId}`, enforced by rules, not by client convention.
- **Secure API key retrieval via Google Cloud Secret Manager** — the Gemini key is mounted as an env var from Secret Manager at deploy time; it is never in the image, the repo, or the client.
- **Others:**
  - **Gemini Embeddings** (`gemini-embedding-001`) for semantic memory search.
  - **Google Maps JavaScript API** for location tagging.
  - **Cloud Run** for hosting, with `/healthz` as a probe target.

---

## Architecture

```
Browser (React 19, Vite)
  │  Firebase Auth (Google SSO) ──────► Firebase Identity Platform
  │  Firestore Web SDK ───────────────► Cloud Firestore   [rules enforce isolation]
  │
  └─ fetch /api/*  (Bearer ID token, optional x-gemini-key)
         │
         ▼
   Express on Cloud Run
     ├─ verify ID token against Google JWKS  (issuer + audience pinned)
     ├─ extract optional BYOK key            (shape-validated, never stored)
     ├─ per-user rate limit                  (20 req / 5 min)
     ├─ input caps                           (64 KB body, 100 msgs, 24k chars)
     └─ Gemini  ─ reflect · reflect/stream · analyze · embed · digest
                  GEMINI_API_KEY injected from Secret Manager
```

**The client talks to Firestore directly, and that is deliberate.** Journal reads and
writes are authorized by security rules rather than proxied through the server, so the
rules file is the single, auditable trust boundary — which is exactly the artifact a
reviewer should be reading. The server exists only to hold the Gemini key and to
enforce what rules cannot.

---

## Security model

### 1. The database is isolated by rules, not by convention

```javascript
match /users/{userId}/entries/{entryId} {
  allow read:  if isOwner(userId);
  allow write: if isOwner(userId) && hasValidLocation() && isWithinSizeBounds();
}
```

### 2. Admins deliberately cannot read your journal

The obvious implementation gives `role == 'admin'` read access to every user's
entries. On an app whose entire premise is private reflection, that is a diary
backdoor wearing an administrator's badge. So admin capability stops at:

- the **profile document** (`uid`, `email`, `displayName`) — read-only, no write;
- the `/admin_data` collection;
- server routes under `/api/admin/*`, which return uptime and rate-limit counters.

There is **no code path, client or server, that lets an administrator read entry
content.** This costs us an admin feature. That is the point.

### 3. Documents are bounded

A signed-in user can only write to their own subcollection — but "their own" is not
the same as "unlimited". Rules cap messages (200), title (200 chars), summary
(2 000 chars), and the embedding vector (768 floats), and reject coordinates outside
real latitude/longitude ranges.

### 4. The API is bounded

| Control | Value |
|---|---|
| Request body | 64 KB (`express.json`) |
| Conversation | 100 messages / 24 000 characters |
| Rate limit | 20 requests / 5 minutes, **per user** |
| Model call timeout | 15 s per model, across a 4-model fallback ladder |

Rate limiting is an in-memory sliding window per instance — honest for a service
deployed with a low `--max-instances`, and marked in the source with its ceiling and
upgrade path. Callers supplying their own Gemini key bypass the limit, because they
are not spending our quota.

### 5. Keys never leak

- The Gemini key is injected from **Secret Manager**; it is never committed, never
  bundled, and never sent to the browser.
- Every error returned to a client passes through a scrubber that redacts anything
  matching a Google API key, so a provider error can never echo a key back.
- A user-supplied BYOK key lives in `localStorage` only. It is never written to
  Firestore, never logged, and never cached server-side — a fresh client is built per
  request and discarded.
- `.gcloudignore` explicitly excludes `.env`, so a local secret cannot ride along into
  a build context.

### 6. Browser-side hardening

`Content-Security-Policy` (production only, since the Vite dev server needs inline
scripts), plus `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Strict-Transport-Security`, and a `Permissions-Policy` that
grants only the microphone and geolocation the app actually uses.

### 7. About the Firebase config in `src/lib/firebase.ts`

It is committed on purpose, and it is not a leak. A Firebase Web API key is a public
project **identifier**, not a credential — it authorizes nothing on its own. Access is
governed by Firestore security rules and the Authorized Domains allowlist. Google
documents it as safe to expose in client code. The secret that *does* matter — the
Gemini key — is the one in Secret Manager, and it never reaches the browser.

---

## Running locally

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # http://localhost:3000
```

## Tests

```bash
npm run lint          # tsc --noEmit
npm run test:rbac     # 26 assertions: RBAC, rate limiting, input caps, key redaction
npm run test:search   # cosine-similarity maths + live embedding ranking
```

`test:rbac` imports the real middleware out of `server.ts` rather than
reimplementing it, so it fails when the server changes.

## Deploying to Cloud Run

> Billing must be enabled on the project first — Cloud Run and Secret Manager both
> require it.

```bash
# 1. APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com

# 2. Store the Gemini key in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
printf '%s' "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. Deploy (Node buildpacks — no Dockerfile needed; `npm start` is the entrypoint)
#
# VITE_GOOGLE_MAPS_API_KEY must be a BUILD env var, not a runtime one: Vite
# inlines it into the bundle during `npm run build`. `.env` is excluded from the
# build context by .gcloudignore (so secrets cannot ride along), so without
# --set-build-env-vars the deployed bundle would ship with no Maps key at all.
gcloud run deploy ai-journal-reflections \
  --source . \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars=NODE_ENV=production \
  --set-build-env-vars=VITE_GOOGLE_MAPS_API_KEY=YOUR_MAPS_BROWSER_KEY \
  --allow-unauthenticated \
  --max-instances=2 \
  --region=us-central1

# 4. Challenge label
gcloud run services update ai-journal-reflections \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1

# 5. Security rules
firebase deploy --only firestore:rules
```

**After deploying:**

1. Add the Cloud Run URL to Firebase Console → Authentication → Settings →
   **Authorized domains**, or Google sign-in will fail in production while working
   locally.
2. Add the Cloud Run URL as an **HTTP referrer restriction** on the Maps browser key
   (Console → APIs & Services → Credentials). A Maps browser key is necessarily
   visible in the bundle, so the referrer allowlist — not secrecy — is what stops
   someone lifting it and billing usage to this project.

### Google Maps requires billing

Maps Platform will not serve tiles to a project without an active billing account.
With billing disabled the map renders a grey
"This page can't load Google Maps correctly" overlay (`BillingNotEnabledMapError`),
even when the key and API are configured correctly. The app detects this through the
SDK's `gm_authFailure` callback and falls back to manual coordinate entry rather than
showing Google's dialog inside the layout — but the map itself needs billing on.

### Granting yourself the admin role

```bash
npx tsx scripts/bootstrap-admin.ts <UID>
```

Sets the `role` custom claim via the Admin SDK. A client cannot set its own claim.

---

## Verifying a deployment

```bash
URL=https://your-service.run.app
curl -s $URL/healthz                                   # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{"messages":[]}' \
  $URL/api/gemini/reflect                              # 401 — no token
```

Then in the browser:

1. Sign in with Google; write a reflection and watch the reply stream in.
2. Press the mic and dictate an entry.
3. **Synthesize & Catalog** — generates title, summary, mood, category, and the
   search embedding in one pass.
4. Switch the sidebar search to **Meaning** and search for a feeling, not a word.
5. Tag an entry with **Use my current location** and confirm the coordinates fill in.
6. Open **Insights** and generate your week in review.
7. Sign out, sign in as a different Google account, and confirm the sidebar is empty.

---

## Built with Google AI Studio

The custom instructions used to drive the AI coding agent — including the scope
discipline rules and the Maps API key directive — are in
[`docs/CUSTOM_INSTRUCTIONS.md`](docs/CUSTOM_INSTRUCTIONS.md). The development
timeline is in [`progress.md`](progress.md).
