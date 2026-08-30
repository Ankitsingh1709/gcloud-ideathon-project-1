# Reflect.ai — Development Journey & Progress Log

Welcome to the development progress ledger for **Reflect.ai**. This file tracks the evolutionary timeline of our application, capturing functional additions, architectural pivots, and security hardening benchmarks implemented across successive development cycles.

---

## 📅 Chronological Journey

### Milestone 3: Location-Aware Journaling via Google Maps
**Date:** August 30, 2026  
**Status:** Completed & Deployed

#### 🌟 Feature Summary
Extended the journaling workflow with optional location metadata. Users can now tag their reflections with precise geographic coordinates and descriptive place names using an interactive map picker.

#### 🛠️ Technical Implementation
1. **Maps JS Platform Integration**: Integrated `@vis.gl/react-google-maps` to embed clean, interactive Maps.
2. **Double-Input MapPicker**: Designed a robust input module supporting coordinate boundary validation, physical place naming, and dynamic map pinning with visual coordinate indicators.
3. **Graceful Standby Fallbacks**: Implemented fallback state systems when `VITE_GOOGLE_MAPS_API_KEY` is missing, allowing full manual form input.
4. **Data Isolation Hygiene**: Extended schema with optional nested location properties `{ lat: number, lng: number, placeName?: string }`. Sanitized raw payloads to filter `undefined` properties before database persistence.
5. **Real-time Synchronization Bugfix**: Resolved a critical data-mapping bug in `src/App.tsx` where real-time snapshots (`onSnapshot`) omitted the `location` field during document parsing. Implemented precise primitive state synchronization hooks (`useEffect` on coordinate values) to guarantee persistent coordinates load instantly upon selecting historical reflections.

#### 🛡️ Threat Model & Security Assurance
* **Zero Hardcoding**: Strictly restricted the Google Maps key to build-time environment variables (`import.meta.env.VITE_GOOGLE_MAPS_API_KEY`).
* **Database Guardrails**: Enhanced `/firestore.rules` to strictly validate coordinates at the schema boundary, rejecting coordinates that exceed geographic boundaries (Latitude -90 to 90, Longitude -180 to 180).
* **Private Sandboxing**: Access to location-enriched journal records remains securely scoped under owner-only read/write constraints.

---

### Milestone 2: Multi-View Insights & Behavioral Trend Analytics
**Date:** August 30, 2026  
**Status:** Completed & Deployed

#### 🌟 Feature Summary
Added a rich client-side analytics tab visualizing historical mood dynamics, consecutive-day journaling streaks, and semantic categories over time.

#### 🛠️ Technical Implementation
1. **Double-Tab Navigation Architecture**: Introduced a polished segment control switcher within the sidebar layout to swap active states between the `workspace` (Reflective Chat) and the new `insights` analytics panel.
2. **Deterministic Data Transformation**:
   * Map semantic moods (e.g., `😊 Joy`, `🧘 Serene`) to precise numerical indices ($1.0 - 5.0$) to support trend analysis.
   * Group reflections into standard 7-day increments trailing back 6 weeks from today.
3. **Data Visualizations (Recharts)**:
   * **Weekly Mood Index Trend**: Smooth, responsive Area chart mapping general sentiment volatility over time.
   * **Focus Distribution**: Horizontal Bar chart detailing cataloged tag frequencies (e.g., `#Habits`, `#Personal`, `#Work`).
4. **Active Streak Calculation**: Derived daily streaks by sorting chronological reflections and verifying consecutive-day active timestamps with configurable slack allowance.

#### 🛡️ Threat Model & Security Assurance
* **Data Leak Mitigation**: The Insights panel does **not** introduce any new Gemini API calls or auxiliary background query loops. It processes existing `entries` directly from React state.
* **Access Control Bound**: Entries are retrieved strictly from the authenticated user's subcollection path (`users/{userId}/entries`).
* **Firestore Verification**: Confirmed that all read operations are strictly evaluated against `/firestore.rules`, matching owner-bound conditions:
  ```javascript
  match /users/{userId}/entries/{entryId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```

---

### Milestone 1: Dynamic "On This Day" Panel
**Date:** August 30, 2026  
**Status:** Completed & Deployed

#### 🌟 Feature Summary
Created an interactive "On This Day" drawer collapsed directly above the conversation pane to surface old reflections written exactly 1 week, 1 month, or 1 year ago.

#### 🛠️ Technical Implementation
1. **Relative Date Filtering**: Evaluates stored Unix timestamps against standard offsets (5–9 days, 25–35 days, and 340–385 days) to identify chronological milestones.
2. **Interactive Prompts**: Developed a quick "Reflect" control that populates the editor with blockquoted highlights from the historical entry.
3. **Firestore Seeding Engine**: Integrated local testing helpers that let developers easily seed historical entries directly into their isolated Firestore document tree.

---

*Compiled with care by the AI Coding Agent on the Google AI Studio platform.*
