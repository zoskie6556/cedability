# Prompt for GitHub Copilot: CEDAbility Accessibility and Voice Feature

> **How to use this file**
> 1. Open **Copilot Chat** in **Agent mode**. Attach `DATA_MODEL.md`, `TEAM_NOTES.md` and your screenshot `animation_style.png` (drag it into the chat) as the visual reference.
> 2. Paste everything between **PROMPT START** and **PROMPT END**, then add: `Start with Phase 1 only. Stop at the end of it and give me the summary from section 7.`
> 3. After each phase: run `npx ng build`, test in the browser, commit, then send `Phase N works. Continue with Phase N+1 only.` If something is broken, paste the exact error and ask for a fix of that issue only.
> 4. If Copilot starts ignoring the rules, open a new chat, re-attach the files, paste the prompt and say which phases are already done.

---

## PROMPT START

You are a senior Angular, Web Audio and Firebase engineer. Build the **Accessibility and Voice** feature for **CEDAbility**, an innovation management portal for CEDA Botswana. Read `DATA_MODEL.md` and `TEAM_NOTES.md` first and follow them. The attached screenshot is the **visual reference** for the audio player style.

### 1. Goal

Let any user use the portal comfortably with their voice and ears:
1. **Read aloud:** natural, human-sounding audio for page content, evaluator feedback and status updates.
2. **Voice input:** dictate into forms and text areas.
3. **Voice commands:** navigate and operate the app hands-free ("go to submit idea", "next field", "read this page", "submit").
4. **Draft ideas by voice:** the user speaks rough thoughts and an AI assistant turns them into a structured draft the user can edit.
5. **Personal accessibility settings:** voice choice, speed, text size, contrast, reduced motion.

This feature supports users with visual impairments, motor difficulties and low literacy, and it must never be the *only* way to do something.

### 2. Constraints

**Stack:** Angular (check `package.json` and follow its conventions), standalone components, signals, strict TypeScript, SCSS, AngularFire, Cloud Functions for Firebase (TypeScript, 2nd gen).

**Where to work**
- Frontend code in `src/app/features/accessibility/` (classic file naming: `name.component.ts`, `.html`, `.scss`). Subfolders: `components/`, `directives/`, `services/`, `models/`.
- Add pages as child routes in `features/accessibility/accessibility.routes.ts`. Do **not** edit `src/app/app.routes.ts`.
- The only allowed edit outside this folder is **adding one line to `src/app/app.html`** (and importing the component in the root component) to mount the floating `<app-voice-dock />`. Mention it in your summary so the team knows.
- Backend code in `functions/src/accessibility/*.ts` (create `functions/` if missing, and share the existing one if the admin dashboard already created it).
- Update `DATA_MODEL.md` for any new collection or field.

**Quality rules**
- Lazy-load pages. No `any`. Typed models. Loading, empty and error states everywhere.
- All colours, radii and shadows come from CSS variables (design tokens) in `features/accessibility/accessibility-theme.scss`. No hardcoded hex values in components. CEDA will supply branding later.
- **WCAG 2.2 AA:** keyboard operable, visible focus, ARIA labels and roles, live regions for status changes, contrast AA, and **captions/transcripts** for any audio that is spoken.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- No API keys in the client or the repo. Provider keys live only in Cloud Functions secrets (Secret Manager).

### 3. The orb player (main visual component)

Build `<app-voice-orb>` in `features/accessibility/components/voice-orb/`, **inspired by the attached screenshot** (original implementation; do not copy any third-party assets or branding).

**Look**
- A circular orb, size set by an input (`sm` 64px, `md` 160px, `lg` 280px).
- Soft multi-colour **gradient** made from layered radial gradients, with a fine **film-grain texture** (SVG `feTurbulence` noise overlay with `mix-blend-mode`), subtle inner shading for a spherical feel.
- A white circular **play/pause button** centred on the orb, with a crisp icon that morphs between play and pause. Hover: slight scale-up. Focus: clear ring.
- Colour themes via an input and tokens: `warm` (orange, for reading aloud), `cool` (purple/pink/blue, for the assistant), `deep` (dark brown with a light edge, for listening). Easy to add more.

**Motion**
- **Idle:** the gradient blobs drift slowly (transform and background-position animations, 12 to 20 s loops, GPU-friendly).
- **Playing:** the orb gently **breathes**, driven by real audio level. Use the Web Audio API `AnalyserNode` to compute a smoothed 0 to 1 level, update one CSS variable (`--level`) with `requestAnimationFrame`, and scale or brighten the orb from it. Throttle and stop the loop when not playing.
- **Loading:** subtle shimmer ring.
- **Listening (mic on):** a slow pulse that responds to mic level.
- **Reduced motion:** no drifting or breathing. Show a static orb with a simple ring that changes opacity for state.

**API (inputs/outputs)**
`state: 'idle'|'loading'|'playing'|'paused'|'listening'|'error'`, `theme`, `size`, `level` (0 to 1), `label` (accessible name), outputs `playToggle`, `stop`. Use `aria-pressed` on the button and an `aria-live="polite"` status text (visually hidden) such as "Playing", "Paused".

**Voice picker (carousel of orbs)**
On the settings page, show available voices as a **horizontally scrollable carousel of orbs** (focused one larger in the centre, neighbours smaller and faded, arrow buttons plus swipe and keyboard arrows). Each orb has a name and short description and a play button for a short **preview**. Selecting a voice stores it in the user's preferences.

### 4. Services and directives

- `SpeechPlayerService` (singleton): `speak(text, options)`, `pause()`, `resume()`, `stop()`, exposes signals `state`, `level`, `currentText`, and a queue for long text split into sentences. Uses the backend TTS (section 5) and **falls back to the browser `speechSynthesis`** when the backend fails, is offline or the quota is used up. Never plays two sources at once.
- `VoiceInputService`: wraps the **Web Speech API** `SpeechRecognition` (feature-detect, handle Chrome/Edge prefixes, permission denied, no speech, network errors). Exposes `listening`, `interimTranscript`, `finalTranscript` signals and `start()`/`stop()`.
- `VoiceCommandService`: parses final transcripts into commands with a small, testable **intent map** (not free-form AI): `navigate(<page>)`, `readPage`, `stopReading`, `nextField`, `previousField`, `fillField(<label>, <value>)`, `submit`, `help`, `cancel`. Fuzzy-match page names against a registry of routes. **Always ask for spoken and visual confirmation before submit or any destructive action.**
- `[appReadAloud]` directive: put on any element or button to read its text or a bound string through `SpeechPlayerService`.
- `[appVoiceInput]` directive: put on an `input` or `textarea` (works with reactive forms and `ngModel`) to add a small mic control. Dictation updates the control value and dispatches the proper `input` event.
- `AccessibilityPreferencesService`: signals for `voiceId`, `rate`, `autoReadFeedback`, `fontScale`, `highContrast`, `reduceMotion`. Persist to `users/{uid}/preferences/accessibility` when signed in, with **`localStorage` fallback** for signed-out screens. Apply font scale and contrast through CSS variables on `<html>`.
- `<app-voice-dock />`: a small floating orb button (bottom corner, repositionable, never covering primary actions) that opens a panel with: read this page, dictate, "What can I say?" command list, and a link to settings. Also open with a keyboard shortcut (for example `Alt+V`) and add a **skip link** target.

### 5. Backend (Cloud Functions)

All callable functions must reject unauthenticated callers, validate input, throw correct `HttpsError` codes, and write to `auditLogs` only for sensitive actions.

- `synthesizeSpeech({ text, voiceId, rate })`:
  - Limit text length (for example 1,500 characters per call) and **per-user daily quotas** (store counters in `users/{uid}/usage/{yyyy-MM-dd}`); return a clear `resource-exhausted` error when exceeded so the client falls back to the browser voice.
  - Call a **text-to-speech provider** from the server only. Put the provider behind an interface (`TtsProvider`) with one implementation now (Google Cloud Text-to-Speech or ElevenLabs, chosen by config) so it can be swapped. Keys come from Secret Manager.
  - **Cache** results: hash of `(provider, voiceId, rate, normalizedText)` → audio file in Firebase Storage (`tts-cache/{hash}.mp3`), and return a short-lived signed URL or the audio bytes. Repeated phrases such as UI labels must never be synthesized twice.
  - Strip HTML, collapse whitespace, and refuse empty text.
- `listVoices()`: returns the curated list of voices (id, display name, description, language, orb theme) from a config document `settings/voices`, so admins can change them without redeploying.
- `draftIdeaFromTranscript({ transcript, formDefinitionId })`: sends the transcript to an LLM (provider behind an interface, key in Secret Manager) with a strict system prompt and returns **JSON only** matching the active form's field keys (`title`, `summary`, `answers`, ...). Validate the JSON against the form definition, drop unknown keys, cap length, and never invent facts: unknown fields stay empty. Apply a daily quota. **Do not store the transcript** unless the user saves the draft.
- Firestore rules additions: users can read and write only their own `users/{uid}/preferences/*`; `users/{uid}/usage/*` is writable by Functions only; `settings/voices` readable by signed-in users, writable by admin.

### 6. Build in phases (stop after each phase)

**Phase 1: Orb player and browser-voice playback**
Orb component with all states, themes, sizes, reduced-motion behaviour, and a `/accessibility/voice-settings` demo page showing the orbs and a sample paragraph with a play/pause control. `SpeechPlayerService` using the browser `speechSynthesis` only, with a simulated level for the animation (real audio level comes in Phase 2). Unit tests for the orb state logic.

**Phase 2: Natural voice backend**
`synthesizeSpeech` and `listVoices` functions with caching and quotas, `SpeechPlayerService` upgraded to play the returned audio through an `<audio>` element connected to an `AnalyserNode` for the real `--level`, automatic fallback to the browser voice, sentence queueing for long text, and the **voice picker carousel** with previews. Emulator-testable with a **mock TTS provider** so development never spends credits.

**Phase 3: Voice input and form filling**
`VoiceInputService`, `[appVoiceInput]`, a visible live transcript with a clear "listening" orb state, and error messages for denied permission and unsupported browsers (with a typed-input fallback). Add a mic consent notice: audio is processed by the browser's speech service, we do not store audio.

**Phase 4: Voice commands and the voice dock**
`VoiceCommandService` intent map, the floating `<app-voice-dock />`, route registry for navigation, field-by-field form filling by label, confirmation before submit, a "What can I say?" help panel, and the keyboard shortcut. Unit tests for the intent parser with many phrasing variations.

**Phase 5: Idea drafting by voice, preferences and polish**
`draftIdeaFromTranscript`, a "Draft with voice" flow on the idea submission page (via an exported component or directive that the submissions owner can drop in, without editing their files), the settings page for all preferences (font scale, contrast, reduced motion, auto-read feedback, voice), Firestore rules and tests, an accessibility audit pass (axe or Lighthouse), and a short `features/accessibility/README.md`.

### 7. Definition of done and how to respond

- `npx ng build` and `cd functions && npm run build` pass. Works against the **Firebase emulators**.
- Keyboard-only and screen-reader walkthrough of every control works. Voice features degrade gracefully (typed input, browser voice) when unsupported.
- Test in Chrome and Edge; document Firefox/Safari limitations for speech recognition honestly in the README.
- Test with English first and document how the voice and language lists could add other languages.
- No secrets committed. `DATA_MODEL.md` updated.

Work phase by phase. At the end of each phase give: files created or changed, how to run and test it, assumptions, and anything you need from me. If something is ambiguous, state your assumption and continue.

## PROMPT END
