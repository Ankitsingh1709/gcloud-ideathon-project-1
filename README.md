# Reflect.ai — a private AI journal that remembers what you meant

**Live demo:** https://ai-journal-reflections-202050000797.us-central1.run.app
**Source:** https://github.com/Ankitsingh1709/gcloud-ideathon-project-1
**Stack:** React 19 · Express · Firebase Auth · Cloud Firestore · Gemini · Cloud Run

Reflect.ai is a journaling application built on the Cloud Run AI challenge baseline
and taken well past it. You speak or type a reflection, Gemini answers as it streams,
and every catalogued entry is embedded so you can later ask *"when have I felt like
this before?"* and get your own past back — ranked by meaning, not keywords.

The design constraint throughout was that a journal is the most private thing a
person will put in a database. Several decisions below cost features on purpose.

---

## Table of contents

- [Custom features — what changed, and how](#custom-features--what-changed-and-how)
- [Third-party integrations — setup steps](#third-party-integrations--setup-steps)
- [Google Cloud services used](#google-cloud-services-used)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Running locally](#running-locally)
- [Tests](#tests)
- [Deploying to Cloud Run](#deploying-to-cloud-run)
- [Verifying a deployment](#verifying-a-deployment)

---

## Custom features — what changed, and how

Everything in this section is beyond the starter lab. Each entry names the files and
endpoints that were added or changed, so the diff is reviewable rather than described.

### 1. Semantic memory search

Search your journal by *feeling*, not by keyword. Query "when did I feel stuck?" and
entries that never contain the word "stuck" come back ranked first.

**How it works.** Every catalogued entry is embedded with `gemini-embedding-001` at
768 dimensions and L2-normalized once on write. At search time the query is embedded
through the same endpoint and ranked by cosine similarity against vectors already
sitting in React state — no vector database, and no additional Firestore reads.

**Changes**

| File | Change |
|---|---|
| `server.ts` | Added `POST /api/gemini/embed`. Calls `gemini-embedding-001` with `outputDimensionality: 768`, normalizes, returns the vector. |
| `src/lib/vector.ts` | **New.** `l2Normalize` and `cosineSimilarity`, dependency-free so the server, the UI, and the test suite all import the same maths. |
| `src/components/MainDashboard.tsx` | *Synthesize & Catalog* now issues `/api/gemini/analyze` and `/api/gemini/embed` in one `Promise.all`, so an entry becomes searchable the moment it is catalogued. A failed embedding is caught and the entry still saves. |
| `src/components/Sidebar.tsx` | Added the **Text / Meaning** search toggle and the ranked top-5 result list, with an empty state that tells you to catalogue an entry first. |
| `src/App.tsx` | The `onSnapshot` mapper now reads the `embedding` field back off the document — omitting it left search with nothing to rank. |
| `firestore.rules` | The embedding vector is bounded at 768 floats. |
| `scripts/test-semantic-search.ts` | **New.** 12 assertions: cosine edge cases (orthogonal, opposite, zero, mismatched dimensions) plus a live call proving a related memory outranks an unrelated one. |

**Why `l2Normalize` exists.** `gemini-embedding-001` returns an *unnormalized* vector
whenever `outputDimensionality` is anything other than the native 3072 — measured L2
norm of ~0.59 at 768 dims. Normalizing once on write means cosine similarity later
reduces to a dot product.

**Try it:** catalogue two or three entries → switch the sidebar search to **Meaning**
→ search for an emotion you never actually typed.

---

### 2. Streaming reflections over SSE

Gemini's reply appears token by token instead of arriving as a block after a wait.

**Changes**

| File | Change |
|---|---|
| `server.ts` | Added `POST /api/gemini/reflect/stream` using `generateContentStream`, writing `text/event-stream` chunks. |
| `src/lib/api.ts` | Reads the stream off `fetch`'s `ReadableStream` and parses SSE frames by hand. |

**Why it is hand-parsed.** `EventSource` cannot send an `Authorization` header, and
every `/api/*` call here carries a Firebase ID token. So the stream is read from
`fetch` instead, and the SSE framing is parsed manually.

**Fallback behaviour.** Each model in the ladder gets a 12s *time-to-first-token*
deadline. If nothing arrives, the next model is tried. Once a single token has
reached the screen the stream is committed — it will never silently restart
mid-sentence. If the whole stream route fails before any output, the client falls
back to the non-streaming `POST /api/gemini/reflect`.

---

### 3. Voice journaling

**Changes:** `src/lib/useSpeechRecognition.ts` (**new**), wired into
`src/components/MainDashboard.tsx`.

Built on the **native Web Speech API** — no library, and no audio ever leaves the
device. The browser does the transcription locally and only the resulting text is
sent anywhere. `isSpeechRecognitionSupported` is exported and the mic control is
hidden entirely where the API is absent (Firefox), rather than rendering a button
that fails.

**Setup:** none. No key, no API to enable. It needs `microphone=(self)` in the
`Permissions-Policy` header, which `server.ts` already sets.

---

### 4. Week in review (metadata-only digest)

A short Gemini-written letter about your patterns over the last seven days.

**Changes:** `POST /api/gemini/digest` in `server.ts`;
`src/components/InsightsDashboard.tsx` for the panel and the **week / all-time**
toggle.

**The privacy decision.** The digest endpoint receives only entry *metadata* — date,
title, one-line summary, mood, category — capped at 30 entries. Full journal prose is
never sent to the digest model. The selected period is passed to the server and named
in the prompt, so the letter cannot claim to describe "this week" while actually
holding your whole archive.

---

### 5. Location-tagged entries (Google Maps + Geolocation)

**Changes:** `src/components/MapPicker.tsx` (**new**), coordinate validation in
`firestore.rules`, an optional `location: { lat, lng, placeName? }` on the entry
schema in `src/types.ts`.

Three ways to set a location, degrading in that order:

1. **Use my current location** — native `navigator.geolocation.getCurrentPosition`, with an accuracy readout in metres. Works even when the map itself cannot load.
2. **The map picker** — `@vis.gl/react-google-maps`, pans and re-centres on the selected point.
3. **Manual coordinate entry** — always available.

**Failure handling.** Maps Platform refuses to serve tiles to a project without
active billing, rendering a grey `BillingNotEnabledMapError` overlay. The component
traps the SDK's `gm_authFailure` callback and falls back to manual entry rather than
letting Google's dialog break the layout.

**Validation is in the rules, not just the UI** — latitude −90..90, longitude
−180..180 — so a hand-crafted write is rejected at the database, not at the form.

---

### 6. Insights dashboard

**Changes:** `src/components/InsightsDashboard.tsx` (**new**), `src/lib/mood.ts`
(**new** — the mood→index mapping, shared rather than duplicated across components),
`recharts` added.

Weekly mood-index trend, consecutive-day streak, and category distribution. It issues
**no new Firestore queries and no new Gemini calls** — everything is derived from the
entries already in React state.

---

### 7. Bring-your-own-key

**Changes:** `src/lib/api.ts` (`localStorage` accessors + shape regex), key extraction
and validation in `server.ts`.

Optionally use your own Gemini key. It lives in `localStorage` only — never written to
Firestore, never logged, never cached server-side (a fresh client is constructed per
request and discarded). Callers supplying their own key bypass the rate limit, because
they are not spending the project's quota.

---

### 8. Admin RBAC console

**Changes:** `src/components/AdminDashboard.tsx` (**new**),
`GET /api/admin/system-stats` behind `requireAdminRole` in `server.ts`,
`scripts/bootstrap-admin.ts` (**new**), `scripts/test-admin-rbac.ts` (**new**, 31
assertions).

Custom-claim roles verified server-side against the decoded token. Scope is
deliberately limited to operational metadata — see [Security model](#security-model)
§2 for why administrators cannot read journal entries.

**Setup:** `npx tsx scripts/bootstrap-admin.ts <UID>` — sets the `role` custom claim
through the Admin SDK. A client cannot grant itself the claim.

---

### 9. Original design system

**Changes:** `src/index.css`, a full palette migration across every component.

A warm "ink on paper" palette where **colour is reserved for mood** — the interface
itself is monochrome, so the only saturated thing on screen is how you felt. Body
copy is Instrument Sans; journal prose is set in Newsreader, a serif, because it is
being read as writing rather than as UI. Every text tier was checked numerically for
WCAG AA contrast rather than by eye, and `prefers-reduced-motion` drops movement
while keeping fades.

---

## Third-party integrations — setup steps

| Integration | Used for | Key required | Where configured |
|---|---|---|---|
| Gemini API | Reflections, analysis, digest | `GEMINI_API_KEY` (server) | Secret Manager → env var |
| Gemini Embeddings | Semantic search | same key | same |
| Firebase Auth | Google SSO | public web config | `src/lib/firebase.ts` |
| Cloud Firestore | Entry storage | public web config | `src/lib/firebase.ts` + `firestore.rules` |
| Google Maps JS API | Location picker | `VITE_GOOGLE_MAPS_API_KEY` (browser) | **build-time** env var |
| Web Speech API | Voice journaling | none | native browser API |
| Geolocation API | One-tap location | none | native browser API |

### Gemini (server-side)

```bash
gcloud services enable generativelanguage.googleapis.com
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
printf '%s' "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

Restrict the key to `generativelanguage.googleapis.com` under
**Console → APIs & Services → Credentials → API restrictions**.

The model ladder is defined in `server.ts` as `FALLBACK_MODELS` — `gemini-3.6-flash`,
`gemini-3.1-flash-lite`, `gemini-flash-latest`, `gemini-3.7-flash` — with a 15s
timeout per model. Reorder that array to change preference.

### Firebase Auth and Firestore

1. Enable the **Google** sign-in provider in Firebase Console → Authentication.
2. After deploying, add your Cloud Run URL under Authentication → Settings →
   **Authorized domains**, or sign-in works locally and fails in production.
3. Deploy the rules: `firebase deploy --only firestore:rules`.

This project uses a **named** Firestore database, not `(default)`. The id is set in
both `firebase.json` and `src/lib/firebase.ts` — they must match, or the client
writes to a database the rules were never deployed to.

### Google Maps JavaScript API

```bash
gcloud services enable maps-backend.googleapis.com
```

Billing must be active — Maps Platform will not serve tiles otherwise.

**`VITE_GOOGLE_MAPS_API_KEY` must be a *build* variable, not a runtime one.** Vite
inlines `VITE_`-prefixed values into the bundle during `npm run build`. Since
`.gcloudignore` excludes `.env` from the build context, passing it as
`--set-env-vars` produces a deployed bundle with no Maps key at all. Use
`--set-build-env-vars`.

**Restrict the key.** A Maps browser key is necessarily visible in the bundle, so the
referrer allowlist — not secrecy — is the control. Console → Credentials → the Maps
key → **Application restrictions → Websites**:

```
https://your-service.run.app/*
http://localhost:3000/*
```

Also set **API restrictions → Maps JavaScript API** so a lifted key cannot be spent
on anything else.

### Environment variables

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | server, runtime | yes | Gemini + embeddings. From Secret Manager in production. |
| `VITE_GOOGLE_MAPS_API_KEY` | client, **build-time** | no | Map picker. Without it, manual + live location still work. |
| `NODE_ENV` | server | no | `production` enables the CSP. |
| `PORT` | server | no | Injected by Cloud Run. Defaults to 3000. |
| `FIREBASE_PROJECT_ID` | server | no | Token audience/issuer pinning. |
| `DISABLE_HMR` | dev | no | Stops file watching during agent edits. |

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
  - **Cloud Run** for hosting, with `/api/health` as a probe target.

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

### API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Liveness probe. Returns version + uptime. |
| `POST /api/gemini/reflect` | ID token | Multi-turn reply, non-streaming. |
| `POST /api/gemini/reflect/stream` | ID token | Same, as SSE. |
| `POST /api/gemini/analyze` | ID token | Title, summary, mood, category. |
| `POST /api/gemini/embed` | ID token | 768-dim normalized embedding. |
| `POST /api/gemini/digest` | ID token | Week-in-review letter from metadata only. |
| `GET /api/admin/system-stats` | ID token + `role: admin` | Uptime and rate-limit counters. |

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
  allow read: if isOwner(userId);

  // create/update and delete must be granted separately. `write` covers all
  // three, but on a delete there is no incoming document, so request.resource
  // is null and any validation helper reading it fails — which silently
  // denied every deletion.
  allow create, update: if isOwner(userId)
                        && hasValidLocation()
                        && isWithinSizeBounds();
  allow delete: if isOwner(userId);
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
| Time to first token | 12 s per model before falling to the next |
| Digest input | 30 entries, metadata only |

Rate limiting is an in-memory sliding window per instance — honest for a service
deployed with a low `--max-instances`, and marked in the source with its ceiling and
upgrade path. Callers supplying their own Gemini key bypass the limit, because they
are not spending our quota.

### 5. Keys never leak

- The Gemini key is injected from **Secret Manager**; it is never committed, never
  bundled, and never sent to the browser.
- Every error returned to a client passes through a scrubber that redacts anything
  matching a Google API key — in **both** formats, the legacy 39-character `AIza…`
  and the newer 53-character `AQ.…` — so a provider error can never echo a key back.
- A user-supplied BYOK key lives in `localStorage` only. It is never written to
  Firestore, never logged, and never cached server-side.
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

The map picker needs `VITE_GOOGLE_MAPS_API_KEY` in `.env`. Without it the app still
runs — live location and manual coordinate entry both work.

## Tests

```bash
npm run lint          # tsc --noEmit
npm run test:rbac     # 31 assertions: RBAC, rate limiting, input caps, key redaction
npm run test:search   # 12 assertions: cosine maths + live embedding ranking
```

`test:rbac` imports the real middleware out of `server.ts` rather than
reimplementing it, so it fails when the server changes. `test:search` makes a live
call to the embedding endpoint and asserts that a semantically related memory
actually outranks an unrelated one — it fails on a ranking regression, not just a
maths one.

## Deploying to Cloud Run

> Billing must be enabled on the project first — Cloud Run, Secret Manager, and Maps
> Platform all require it.

```bash
# 1. APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  generativelanguage.googleapis.com maps-backend.googleapis.com

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
   (Console → APIs & Services → Credentials).

### Granting yourself the admin role

```bash
npx tsx scripts/bootstrap-admin.ts <UID>
```

Sets the `role` custom claim via the Admin SDK. A client cannot set its own claim.

---

## Verifying a deployment

```bash
URL=https://ai-journal-reflections-202050000797.us-central1.run.app
curl -s $URL/api/health                                # 200 {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{"messages":[]}' \
  $URL/api/gemini/reflect                              # 401 — no token
curl -s -o /dev/null -w '%{http_code}\n' $URL/assets/nope.js   # 404, loudly
```

Then in the browser:

1. Sign in with Google; write a reflection and watch the reply stream in.
2. Press the mic and dictate an entry.
3. **Synthesize & Catalog** — generates title, summary, mood, category, and the
   search embedding in one pass.
4. Switch the sidebar search to **Meaning** and search for a feeling, not a word.
5. Tag an entry with **Use my current location** and confirm the coordinates fill in.
6. Open **Insights** and generate your week in review.
7. Delete an entry.
8. Sign out, sign in as a different Google account, and confirm the sidebar is empty.

---

## Built with Google AI Studio

The custom instructions used to drive the AI coding agent — including the scope
discipline rules and the Maps API key directive — are in
[`docs/CUSTOM_INSTRUCTIONS.md`](docs/CUSTOM_INSTRUCTIONS.md). The development
timeline is in [`progress.md`](progress.md).
