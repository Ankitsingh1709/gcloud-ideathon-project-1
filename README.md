# Reflect.ai — a private AI journal that remembers what you meant

**Live demo:** https://ai-journal-reflections-202050000797.us-central1.run.app
**Stack:** React 19 · Express · Firebase Auth · Cloud Firestore · Gemini · Cloud Run

You speak or type a reflection, Gemini answers as it streams, and every catalogued
entry is embedded so you can later ask *"when have I felt like this before?"* and get
your own past back — ranked by meaning, not keywords.

A journal is the most private thing a person will put in a database. Several
decisions below deliberately cost features to keep that true.

---

## Contents

Grouped by the four judging criteria. Every feature links to what it does and how to
use it in the live app.

**[Authenticity](#authenticity) — what we built beyond the starter lab**
- [Semantic memory search](#semantic-memory-search) — find entries by feeling, not by keyword
- [Streaming reflections](#streaming-reflections) — the reply appears as it is written
- [Voice journaling](#voice-journaling) — speak an entry, no audio ever uploaded
- [Week in review](#week-in-review) — a letter about your patterns, from metadata only
- [Location-tagged entries](#location-tagged-entries) — one tap, a map, or manual
- [Insights dashboard](#insights-dashboard) — mood trend, streak, focus distribution
- [Bring your own key](#bring-your-own-key) — use your own Gemini key
- [Admin console](#admin-console) — roles that stop short of your journal
- [Care and safety guardrails](#care-and-safety-guardrails) — what the model does when an entry is not okay
- [The design](#the-design) — colour reserved for mood

**[Usability](#usability) — sign-in and interactions that do not fail**
- [One-click Google sign-in](#one-click-google-sign-in)
- [Your writing is saved before the AI is called](#your-writing-is-saved-before-the-ai-is-called)
- [Every failure has a way out](#every-failure-has-a-way-out)
- [It works when the extras do not](#it-works-when-the-extras-do-not)
- [Accessibility](#accessibility)

**[Stability](#stability) — error handling and uptime**
- [A four-model fallback ladder](#a-four-model-fallback-ladder)
- [Streaming that never restarts mid-sentence](#streaming-that-never-restarts-mid-sentence)
- [A render crash is recoverable](#a-render-crash-is-recoverable)
- [Failures are loud, not blank](#failures-are-loud-not-blank)
- [Automated checks](#automated-checks)

**[Security](#security) — database paths, API keys, access control**
- [Admins cannot read your journal](#admins-cannot-read-your-journal)
- [Isolation is enforced by rules, not by the client](#isolation-is-enforced-by-rules-not-by-the-client)
- [Keys never reach the browser](#keys-never-reach-the-browser)
- [The one key that must be public is fenced instead](#the-one-key-that-must-be-public-is-fenced-instead)
- [The API is bounded](#the-api-is-bounded)
- [Browser hardening](#browser-hardening)

**Reference**
- [Google Cloud services used](#google-cloud-services-used)
- [Run it yourself](#run-it-yourself)
- [Deploy it yourself](#deploy-it-yourself)

---

# Authenticity

Ten features that are not in the starter lab. Each one names what it does, why it is
not the obvious version, and how to reach it in the running app.

## Semantic memory search

Search your journal by *feeling*. Ask for "when did I feel stuck?" and entries that
never contain the word "stuck" come back first, ranked by meaning.

Every catalogued entry is embedded with Gemini's embedding model and stored alongside
it. Your search phrase is embedded the same way and compared against those vectors in
the browser. There is no vector database and no extra database read — the comparison
runs against entries already on screen.

Measured on live entries: a semantically related memory scores **0.88** against an
unrelated one at **0.67**, on a query whose words appear in neither.

**How to use it**
1. Write an entry and press **Synthesize & Catalog** — this is what makes it searchable.
2. Repeat for two or three entries.
3. In the sidebar, switch the search toggle from **Text** to **Meaning**.
4. Search an emotion you never actually typed — *lost*, *hopeful*, *stuck*.
5. The five closest entries come back in order of similarity.

## Streaming reflections

Gemini's reply appears word by word instead of arriving as a block after a pause, so
the app feels like it is thinking with you rather than making you wait.

**How to use it:** write anything in the composer and press send. The reply streams in.

## Voice journaling

Dictate an entry instead of typing it. Transcription happens **inside your browser** —
no audio file is ever recorded, uploaded, or sent to a server. Only the resulting text
leaves your device.

**How to use it:** press the microphone in the composer and speak. Your words appear
as you talk; press it again to stop.

> Not available in Firefox, which has no speech API. The button is hidden there
> rather than shown broken.

## Week in review

A short letter from Gemini about the patterns in your last seven days — what you kept
returning to, how your mood moved.

It reads only the **outline** of your entries: date, title, one-line summary, mood,
category. Your actual journal prose is never sent to write the letter. The time period
is passed along and named in the prompt, so the letter cannot claim to describe "this
week" while quietly reading your whole archive.

**How to use it**
1. Open the **Insights** tab in the sidebar.
2. Choose **This week** or **All time**.
3. Press **Write my letter**.

## Location-tagged entries

Attach a place to a reflection. Three ways, each working independently of the others:

- **Use my current location** — one tap, with an accuracy readout in metres.
- **The map** — pick a point; the map re-centres on it.
- **Manual coordinates** — always available.

**How to use it:** open an entry, press **Use my current location**, and allow the
browser prompt. Coordinates and accuracy fill in. Or pick a point on the map, or type
coordinates directly.

## Insights dashboard

Your mood as a weekly trend line, your consecutive-day writing streak, and how your
entries distribute across categories. All of it derived from entries already loaded —
it makes no extra database queries and no extra AI calls, so opening it costs nothing.

**How to use it:** press **Insights** in the sidebar.

## Bring your own key

Use your own Gemini API key instead of ours. It is stored in your browser only — never
written to the database, never logged, never kept on the server. Requests made with
your own key skip the rate limit, because they are not spending our quota.

**How to use it:** open the key field in the sidebar, paste a Gemini key, and save.
Clear the field to go back to the shared key.

## Admin console

Role-based access backed by verified custom claims, showing service uptime and
rate-limit counters. Its scope deliberately stops short of your journal — see
[Admins cannot read your journal](#admins-cannot-read-your-journal).

**How to use it:** an account needs the admin role granted server-side
(`npx tsx scripts/bootstrap-admin.ts <UID>`). The console then appears in the sidebar.
A user cannot grant themselves the role.

## Care and safety guardrails

A journal is where distress gets written down first — often before it is said
to anyone. That makes it a different kind of AI product from a chatbot, and it
needs two guardrails that do not come for free.

**Gemini's safety filters bound what the model may *say*. They do not notice
that the *writer* is in trouble.** Left with a warm, reflective system prompt,
the model's instinct on a frightening entry is to ask another gentle
open-ended question — which invites someone further into the feeling instead
of toward a person who can help. So the prompt is explicit: if an entry
suggests risk of harm or a crisis that should not be faced alone, the model
stops the reflective questioning, acknowledges what was written without alarm
or judgement, and points toward a trusted person or a local crisis line. It
does not diagnose, does not minimise, and does not end that reply with a
probing question. The weekly letter carries the same rule for distress that
shows up as a sustained pattern rather than a single entry.

**The companion is a journaling companion and nothing else.** Sign-in is open
to any Google account, so without a scope rule the shared Gemini key is a free
general-purpose LLM behind a Google login — ask it to write code, do homework,
or *"ignore all your previous instructions"*, and a warm, helpful assistant
obliges. It now declines that work in a sentence and offers to help you write
instead, without quoting its rules or announcing that it has been restricted.
The [trial allowance](#bring-your-own-key) is what bounds the *cost* of the
attempt; this is what bounds the *behaviour*.

**A provider refusal answers the person, not the exception.** If Gemini's own
safety filter blocks an entry, every model in the fallback ladder will refuse
the same text — so the ladder stops instead of spending 45 seconds arriving at
the same place, and the reply is a written one that acknowledges the refusal
and points to real support. Otherwise someone who had just written the hardest
thing they have written all year would read *"All Gemini fallback models
exhausted."* Cataloguing a blocked entry falls back to neutral metadata rather
than failing, because the entries most worth keeping are exactly the ones that
must not fail to save.

**Journal text is untrusted input.** Usually it is the writer's own words —
but people paste emails, messages and articles into a journal, and an entry's
model-written title and summary are fed back into the weekly letter later. So
injected text can travel out of one entry and into a different prompt. Every
prompt in the app states that the material is content to reflect on and never
instructions to obey: text imitating a command, a role change, or a request to
disregard instructions is treated as part of what the person wrote. The model
will not adopt a persona from it, restate its instructions, or change its
output format because the content asked it to.

Both guardrails are covered by assertions in `npm run test:rbac`. They are
prompt text, so the realistic failure is someone editing a prompt and dropping
them silently — which no runtime check would catch, and a string assertion
will.

## The design

A warm "ink on paper" palette in which **colour is reserved for mood** — the interface
is monochrome, so the only saturated thing on screen is how you felt. Journal prose is
set in a serif because it is being read as writing, not as UI. Nothing about it looks
like a default AI dashboard, which was the point.

---

# Usability

## One-click Google sign-in

Single sign-on through Google. One button, no account creation, no password, no email
verification step. Sign out and back in as a second Google account and the sidebar is
empty — your entries are yours.

## Your writing is saved before the AI is called

The order matters. Your entry is written to the database **first**, and only then is
Gemini asked to respond. If generation fails, times out, or the network drops, the
thing you wrote is already safe. A journal that can lose your words to a failed API
call is not a journal.

## Every failure has a way out

Generation failures show a **Retry** control rather than a dead end. Loading, empty,
and error states exist on every panel — you are never looking at a blank rectangle
wondering whether it is broken or just slow. Errors say what happened in plain
language, and a rate-limited request tells you how long to wait.

## It works when the extras do not

Each optional integration degrades on its own rather than taking the app with it:

| If this fails | You still get |
|---|---|
| The map will not load | One-tap live location and manual coordinate entry |
| The browser has no speech API | The microphone button is hidden; typing is unaffected |
| An embedding fails while cataloguing | The entry still saves; only search indexing is skipped |
| The streaming route fails | The reply arrives through the non-streaming route |

## Accessibility

Keyboard focus rings throughout, ARIA labels on every icon-only control, and
`prefers-reduced-motion` respected — motion is dropped for anyone who asked for less,
while fades remain. Every text tier was checked numerically against WCAG AA contrast
rather than approved by eye.

---

# Stability

## A four-model fallback ladder

Every Gemini call walks a list of four models with a 15-second ceiling each. If one is
overloaded — and during development two of the four were returning 503 from upstream —
the next is tried automatically. A capacity problem at the provider is invisible to
the person writing in their journal.

## Streaming that never restarts mid-sentence

Each model gets 12 seconds to produce its *first* token. Miss that and the next model
takes over. But once a single word has reached the screen, the stream is committed —
it will never silently restart and rewrite itself halfway through a sentence. Falling
back is only allowed while nothing is visible.

## A render crash is recoverable

An error boundary wraps the app, so a component failure shows a recovery screen
instead of the white page that a React crash would otherwise produce.

## Failures are loud, not blank

The page shell is served uncacheable while fingerprinted assets are cached
permanently. This fixed a real bug where a stale cached shell asked for asset files
that no longer existed and rendered nothing at all. A missing asset now returns a
clear 404 rather than silently returning the HTML page in its place.

The health probe lives at `/api/health`, not `/healthz` — Cloud Run reserves that
path, and a probe pointed at it never reaches the app.

## Automated checks

```bash
npm run lint          # type-checks the whole project
npm run test:rbac     # 31 assertions: access control, rate limits, input caps, key redaction
npm run test:search   # 12 assertions: similarity maths + a live ranking check
```

The access-control suite imports the **real** server middleware rather than a copy of
it, so it fails when the server changes. The search suite makes a live embedding call
and asserts that a related memory genuinely outranks an unrelated one — it catches a
ranking regression, not just a maths error.

---

# Security

## Admins cannot read your journal

The obvious implementation gives an administrator read access to every user's entries.
On an app whose entire premise is private reflection, that is a diary backdoor wearing
an administrator's badge.

So administrator capability stops at operational metadata: the profile document
(name, email, id — read-only), and service counters like uptime and rate-limit usage.

**There is no path, in the client or on the server, for an administrator to read the
contents of anyone's entries.** This costs us an admin feature. That is the point.

## Isolation is enforced by rules, not by the client

Entries live under a per-user path, and access is decided by database security rules —
not by the app remembering to filter. Even a hand-crafted request straight to the
database is refused unless it belongs to the signed-in owner.

The rules also *bound* what an owner may write: caps on message count, title length,
summary length, and the search vector, and a rejection of coordinates outside real
latitude and longitude ranges. "Your own data" is not the same as "unlimited data".

Sign-in tokens are verified on the server against Google's public keys, with the
issuer and audience pinned, so a token minted for another project is rejected.

## Keys never reach the browser

The Gemini key is pulled from **Google Cloud Secret Manager** at deploy time. It is not
in the repository, not in the container image, and never sent to the client. Local
environment files are explicitly excluded from the build context so a developer's key
cannot ride along into a deployment.

The live service will tell you so itself — `/api/health` reports the *name* of the
source it was handed the key from, never the key:

```bash
curl -s https://ai-journal-reflections-202050000797.us-central1.run.app/api/health
# {"status":"ok","version":"1.4.1","uptimeSeconds":…,"geminiKeySource":"google-cloud-secret-manager"}
```

Run the same command locally and it answers `local-env-file`, because there is no
Secret Manager in a dev shell.

Every error returned to a browser passes through a scrubber that redacts anything
shaped like a Google API key — in both the legacy and current key formats — so a
provider error can never echo a key back to a user.

A user's own key, if they supply one, stays in their browser. It is never written to
the database, never logged, and never cached on the server.

> The Firebase configuration visible in the client is a public project **identifier**,
> not a credential. It authorises nothing on its own — access is governed entirely by
> the security rules and the sign-in domain allowlist. Google documents it as safe to
> expose. The key that matters is the Gemini one, and it never leaves the server.

## Prompts are treated as a trust boundary

Journal content reaches four different prompts, and one of them is fed
metadata that an earlier model wrote. Every prompt states that the content is
never an instruction — see
[Care and safety guardrails](#care-and-safety-guardrails).

## The one key that must be public is fenced instead

Every other key in this project can be kept out of the browser. The Google
Maps browser key cannot — the Maps JavaScript API runs client-side, so the key
is necessarily readable by anyone who opens devtools. Treating it as a secret
would be theatre.

So it is not secured by secrecy, it is **fenced on two axes**, and both are
required. Either one alone leaves a usable key:

| Restriction | Value | What it stops |
|---|---|---|
| **Application** (HTTP referrer) | the two Cloud Run URLs + `localhost:3000` | The key lifted from the bundle and used on someone else's site, billed to this project |
| **API** | Maps JavaScript API only | The key being spent on any *other* Google API, even from an allowed page |

Both Cloud Run hostnames are listed deliberately. Cloud Run serves this
service on two URLs — the newer project-number form and the older hash form —
and the console shows the hash one. A key fenced to only the URL you happened
to copy leaves the map broken for anyone arriving by the other.

The same applies to Firebase sign-in, for the same reason: **both** hostnames
are in Authentication → Settings → Authorized domains. A missing one does not
degrade — Google sign-in simply fails on that URL while working perfectly on
the other, which is a hard failure to reproduce if you only ever test one.

> Referrer values are matched as URL prefixes. `https://host/` covers a
> single-route app served from the root; add `https://host/*` as well if the
> app ever grows paths, so a deep link does not fall outside the fence.

## The API is bounded

| Control | Limit |
|---|---|
| Request size | 64 KB |
| Conversation length | 100 messages / 24,000 characters |
| Rate limit | 20 requests per 5 minutes, per user |
| Model timeout | 15 seconds per model, across four models |
| Digest input | 30 entries, outline only |

## Browser hardening

A Content Security Policy in production, plus HSTS, `nosniff`, clickjacking
protection, a strict referrer policy, and a permissions policy that grants only the
microphone and location the app actually uses — and nothing else, camera included.

---

# Google Cloud services used

- **Firebase Authentication** — Google single sign-on; tokens verified server-side.
- **Gemini API** — multi-turn reflection, entry analysis, and the weekly letter.
- **Gemini Embeddings** — the vectors behind semantic memory search.
- **Cloud Firestore** — per-user entry storage, isolated by security rules.
- **Secret Manager** — secure retrieval of the Gemini API key at deploy time.
- **Google Maps JavaScript API** — the location picker.
- **Cloud Run** — hosting, with `/api/health` as the probe target.

---

# Run it yourself

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # http://localhost:3000
```

Add `VITE_GOOGLE_MAPS_API_KEY` to `.env` for the map picker. Without it the app still
runs — live location and manual coordinates both work.

# Deploy it yourself

Billing must be enabled — Cloud Run, Secret Manager, and Maps Platform all require it.

```bash
# 1. Enable the APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  generativelanguage.googleapis.com maps-backend.googleapis.com

# 2. Put the Gemini key in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
printf '%s' "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. Deploy
gcloud run deploy ai-journal-reflections \
  --source . \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars=NODE_ENV=production \
  --set-build-env-vars=VITE_GOOGLE_MAPS_API_KEY=YOUR_MAPS_BROWSER_KEY \
  --allow-unauthenticated --max-instances=2 --region=us-central1

# 4. Deploy the security rules
firebase deploy --only firestore:rules
```

**The Maps key must be a *build* variable, not a runtime one.** Vite bakes
`VITE_`-prefixed values into the bundle during the build. Passing it as
`--set-env-vars` produces a deployed app with no map at all.

**Three things to do after the first deploy:**

1. Add your Cloud Run URL to Firebase Console → Authentication → Settings →
   **Authorized domains**, or sign-in works locally and fails in production.
2. Fence the Maps key (Console → Credentials → the Maps key). Set
   **Application restrictions → Websites** to every hostname the app is served
   from — Cloud Run gives you two — plus `http://localhost:3000/`, and set
   **API restrictions** to the Maps JavaScript API alone. See
   [the one key that must be public](#the-one-key-that-must-be-public-is-fenced-instead).
   Verify it took:

   ```bash
   gcloud services api-keys list \
     --format='table(displayName,restrictions.browserKeyRestrictions.allowedReferrers)'
   ```
3. Confirm it is up:

   ```bash
   URL=https://your-service.run.app
   curl -s $URL/api/health                                        # 200
   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     -H 'Content-Type: application/json' -d '{"messages":[]}' \
     $URL/api/gemini/reflect                                      # 401, no token
   ```
