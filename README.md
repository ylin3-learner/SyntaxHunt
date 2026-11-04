# 🕵️ Anime Character Hunter Lite

**[English](README.md) | [繁體中文](README.zh-TW.md)**

An interactive, cognitive-pipeline-driven English grammar learning tool designed for K-12 education.

Built with **Vue 3, TypeScript, Vite, and Supabase**, this application takes a pedagogical approach to teaching **Post-modifiers (Relative Clauses & Prepositional Phrases)**, specifically targeting the common L1 interference (Chinese pre-modifiers vs. English post-modifiers), structural misconceptions (e.g., redundant pronouns like `who she`), and **Phrase Chunking**. Teachers can also author general grammar questions in `BUILD`, `REDUCE`, or `MORPH` mode; these use a local rule engine with cached and AI-assisted diagnosis for errors it cannot classify locally.

The sample lesson is designed for a 45-minute class for **Grade 9 (115 iE5, Unit 5: *The Man Who Shook Hands with Me Is My Favorite Star*)**, covering Grammar Focus 1 (prepositional phrases), Grammar Focus 2 (subject relative clauses with *who / which / that*), and the p.107 Read activity.

---

## 🧠 The Cognitive Pipeline (Pedagogy-Driven Design)

This app is built upon Second Language Acquisition (SLA) theories. The sample lesson guides students through an input-to-output sequence:

```mermaid
flowchart TD
    Start((Start)) --> Preview
    
    subgraph Presentation ["1. Input & Scaffolding"]
        Preview["🔍 Chunk Preview<br>Form-Meaning Mapping"]
        Input["🎧 Structured Input<br>Listening Comprehension"]
        Preview --> Input
    end

    Input --> Macro
    
    subgraph Practice ["2. Spatial & Form"]
        Macro["🧩 Macro Drag<br>Spatial Post-modification"]
        Micro["🧱 Subtraction UI (Trash Can)<br>Grammar Rule Engine & Visual Gap"]
        Macro --> Micro
    end

    Micro --> Output
    
    subgraph Production ["3. Output & Reflection"]
        Output["🗣️ Pronunciation<br>STT Comparison"]
        Noticing["💡 Noticing Board<br>Self-Correction"]
        Output --> Noticing
    end

    Noticing --> End((Finish))

    %% Behaviorism & Classroom Management
    Focus["⚠️ Anti-Cheat Beep"] -.-> Practice
    Timer["⏱️ Time Pressure"] -.-> Practice
    Data["📊 Error Tracking"] -.-> Teacher((Teacher Dashboard))
    Micro -.-> Data

    subgraph ClassroomMgmt ["🎓 Classroom Management (New)"]
        ClassMode["🔒 Class Mode<br>Lock student progression"]
        Presence["📊 Presence Tracking<br>Live completed count"]
        SelfPace["🟢 Self-Paced Mode<br>Free progression"]
    end

    ClassMode -.-> Practice
    Presence -.-> Teacher
    SelfPace -.-> Practice
```

1. **Chunk Phrase Quiz**: Establishes Form-Meaning Mapping.
2. **Macro Drag & Contrast Puzzle**: Builds a spatial sense of English post-modification (no text labels to prevent answer leaking).
3. **Standard & Reduce**: Features Input Processing, Focus on Form using a unique **"Trash Can" subtraction mechanic**, Prosody Output, and Consciousness-Raising.
4. **General Grammar Canvas**: A separate teacher-authored activity supports `BUILD` (assemble chunks), `REDUCE` (remove redundant chunks), and `MORPH` (change an inflected chunk).

---

## 🏗️ System Architecture

The system is highly decoupled, using **Supabase** as the central hub to connect the Vue 3 frontend, teacher admin, and external AI speech services.

```mermaid
graph TD
    subgraph Client ["Frontend (Vue 3 + TypeScript)"]
        direction TB
        AdminUI["👩‍🏫 Teacher Admin<br>(TeacherAdmin.vue)"]
        StudentUI["👨‍🎓 Student Interface<br>(App.vue)"]
        
        subgraph Composables ["Core Logic (Composables)"]
            Timer["⏱️ useQuizTimer<br>(Absolute Timestamp)"]
            Focus["👁️ useFocusMonitor<br>(Anti-Cheat)"]
            Sound["🔊 useSound<br>(Web Audio)"]
            Speech["🗣️ useSpeech<br>(Cross-Platform)"]
            Sync["📡 useClassroomSync<br>(State Sync & Presence)"]
        end
    end

    subgraph Supabase ["Supabase Cloud Backend"]
        DB[("PostgreSQL<br>(Questions, Logs, State)")]
        Realtime[("Realtime WebSocket<br>(Postgres Changes & Presence)")]
        Storage[("Storage<br>(Images & TTS Cache)")]
        
        subgraph EdgeFunctions ["Edge Functions (Deno)"]
            Action_Proxy["teacher-action<br>(Validate & Update)"]
            TTS_Proxy["deepgram-tts<br>(Deepgram TTS)"]
            STT_Proxy["edge-stt<br>(Deepgram STT)"]
            Grammar_Proxy["grammar-assistant<br>(AI error matrix & diagnosis)"]
        end
    end

    subgraph ThirdParty ["Third-Party API"]
        Deepgram["Deepgram API"]
    end

    %% Data Flow
    AdminUI -- "1. Action Request (with Pwd)" --> Action_Proxy
    Action_Proxy -- "2. Update State" --> DB
    DB -- "3. Postgres Changes" --> Realtime
    Realtime -- "4. Sync State" --> Sync
    Sync -- "5. Update UI & Timer" --> StudentUI
    
    %% Presence Flow
    StudentUI -- "Track Status (Presence)" --> Realtime
    Realtime -- "Live Count Update" --> AdminUI
    
    AdminUI -- "CRUD" --> DB
    StudentUI -- "CRUD & Logs" --> DB
    
    StudentUI -- "TTS Request" --> TTS_Proxy
    TTS_Proxy --> Deepgram
    TTS_Proxy -- "Cache Audio" --> Storage
    
    StudentUI -- "STT Request" --> STT_Proxy
    STT_Proxy --> Deepgram
    AdminUI -- "Generate chunks & error matrix" --> Grammar_Proxy
    StudentUI -- "Fallback diagnosis" --> Grammar_Proxy

    %% Logic Dependencies
    StudentUI -.-> Composables
    AdminUI -.-> Speech
```

---

## 🎙️ Hybrid Speech Architecture

To ensure 100% stability across all devices (iPads, computers, and smart whiteboards with no system voice packs), this app implements a robust **fallback mechanism**.

- **TTS**: Detects native voices. If none, routes to **Deepgram TTS** via Supabase Edge Function.
- **STT**: Bypasses browser restrictions by sending audio to **Deepgram STT** via Supabase Edge Function.

---

## ⚡ Real-time Classroom Flow (Master-Slave & Anti-Cheat)

This sequence diagram illustrates the **Class Mode Lock**, **Presence Tracking**, and **Anti-Cheat** mechanisms.

```mermaid
sequenceDiagram
    participant T as 👩‍🏫 Teacher
    participant EF as 🛡️ Edge Function
    participant RT as 📡 Realtime (Presence & DB)
    participant S as 👨‍🎓 Student A
    participant S2 as 👨‍🎓 Student B

    Note over T,RT: Scenario 1: Teacher enables "Class Mode" (Target: 30)
    
    T->>EF: Enable Class Mode & Set Target
    EF->>RT: Update classroom_state (is_class_mode = true)
    RT-->>S: Sync State (isClassMode = true)
    RT-->>S2: Sync State (isClassMode = true)

    Note over S,RT: Scenario 2: Student Answers & Presence Tracking
    
    S->>S: Complete Question (handleSuccess)
    S->>RT: track({ status: 'completed' })
    RT-->>T: Presence Sync (Update Completed Count: 1)
    
    Note over S,T: Scenario 3: Class Mode Lock
    
    S->>S: Click "Next Question"
    S-->>S: Button Disabled (Wait for Teacher)
    
    T->>EF: Click "🚀 Push to Class"
    EF->>RT: Update Question ID
    RT-->>S: Question switches, track({ status: 'answering' })
    RT-->>S2: Question switches, track({ status: 'answering' })
    
    Note over S, Browser: Anti-Cheat: If tab is hidden, Beep + Red Overlay.
```

---

## ✨ Key Features

### For Students
- **Trash Can Subtraction UI (Reduce Mode)**: Students see the complete sentence and physically discard redundant words into a trash can, witnessing the sentence shrink.
- **Class Mode Lock**: When the teacher enables Class Mode, the "Next" button is disabled. Students must wait for the teacher's push command.
- **Phrase Chunking Visuals**: Multi-word units appear as distinct blue tiles.
- **Randomized Audio**: TTS randomly selects from a pool of voices.
- **Text-Diff Pronunciation Panel**: Record your voice via Deepgram STT.

### For Teachers (Teacher Admin)
- **Presence Dashboard**: Input the target student count. Watch the live progress bar (`completed / target`) update in real-time as students finish.
- **Class Mode Toggle**: Lock the entire class's progression instantly. Perfect for synchronized classroom teaching.
- **Funnel-Based Authoring**: Wrap phrases in `[ ]`. Visualizes "Kept" and "Discarded" words. If a verb needs to become a preposition, edit the green box.
- **Master Remote Control**: Push questions, force-reset timers, and add time (`+30s`) instantly.

### Using general grammar questions

1. Open **Teacher Admin** and select **General Grammar** in the question editor.
2. Choose a grammar concept and interaction mode. The concept supplies a default mode, which can be changed.
3. Enter the source sentence and the exact target answer. For `REDUCE`, enter the complete sentence as the source and the reduced sentence as the answer.
4. Click **Deterministic auto-chunk** or split the sentence manually. Bracket a multi-word chunk in the source, e.g. `[in a blue uniform]`. Review the generated chunks before using them.
5. For `MORPH`, mark each changeable chunk and provide its comma-separated forms (e.g. `go, goes, went`). The auto-chunker recognizes only a small built-in vocabulary; add or correct forms manually.
6. Click **Add to question bank**. Click **Send to class** on that question to make it active, or click **Finish prep** to save the bank and close the editor (reopen Teacher Admin to push it later). Students answer by clicking tiles: assemble in `BUILD`, remove tiles in `REDUCE`, and select forms in `MORPH`.

> **Teacher access note:** The current frontend demo checks the fixed password `admin123`; the `TEACHER_PASSWORD` Supabase secret does not configure this check. This is not secure authentication—do not expose the demo as a public or production teacher console.

---

## 🔬 Grammar Rule Engine & Diagnosis

`src/rules/grammarRules.ts` runs registered validators for duplicate pronouns after a relative pronoun, antecedent-based subject-verb agreement, *who / which* choice, `REDUCE` leftovers, common subject-verb agreement, `a/an` choice, and `MORPH` forms. Concept-specific validators live in `src/rules/validators/` and are discovered by the registry. If those rules do not provide a definite diagnosis, an LCS token alignment compares the student answer with the key to classify omissions, additions, substitutions, or reordering. These checks are rule-based heuristics, not a general-purpose English parser; verb agreement coverage depends on the local verb table.

| Code family | Examples | Local diagnosis |
| :--- | :--- | :--- |
| `M:*` | `M:VERB`, `M:AUX`, `M:DET`, `M:PREP`, `M:CONJ` | A required word or conjunction is missing. |
| `R:*` | `R:VERB:SVA`, `R:VERB:TENSE`, `R:VERB:FORM`, `R:VERB:MOOD`, `R:RELATIVE`, `R:PREP`, `R:DET`, `R:NOUN:NUM`, `R:CONJ` | A verb form, relative pronoun, preposition, determiner, noun number, or conjunction is incorrect. |
| `U:*` | `U:PRON`, `U:VERB`, `U:RELATIVE`, `U:CONJ` | An unnecessary pronoun, verb, relative pronoun, or conjunction remains. |
| `O:*` | `O:WRONG_ORDER`, `O:INVERSION` | Words are out of order, including incorrect auxiliary placement in inversion. |
| `UNKNOWN_ERROR` | — | Local rules cannot assign a specific error; try a prepared diagnosis or AI fallback. |

Each diagnosis also has an SST category: `Omission`, `Addition`, `Misformation`, or `Misordering`. Definite local diagnoses are used first. When local diagnosis returns `UNKNOWN_ERROR`, the student is allowed to continue immediately while the app records a `PENDING` log and requests an asynchronous diagnosis through the `grammar-assistant` Edge Function. The function checks `diagnosis_cache`, calls Gemini if needed, and updates the same log to `SUCCESS` (or `FAILED`); Teacher Analytics reflects status and completed results through Supabase Realtime.

Teacher-authored general grammar questions choose a concept and interaction mode. `autoChunk(sentence, concept)` uses bracketed phrases first, then deterministic tokenization and a small phrase/verb dictionary; it does not call an LLM. MORPH options are stored as strings with `current_index` identifying the initial selected form, while legacy `morph_options` remains supported. The canvas routes new concepts to a timeline, modal-strength gauge, shredder, or magnetic-slot interaction. Questions without a concept keep the legacy canvas.

### How the Rule Registry connects authoring, gameplay, and diagnosis

The registry is the **local diagnosis plugin point**, not the question authoring UI router:

1. **Authoring:** In Teacher Admin, the teacher selects a grammar concept and `BUILD`, `REDUCE`, or `MORPH`, enters a sentence and answer, then uses deterministic `autoChunk` (or edits the chunks and morphology options). The chosen concept and mode are saved with the question. `autoChunk` does not consult the Rule Registry.
2. **Gameplay UI:** `GrammarCanvas.vue` selects a canvas from the saved `concept` and `ui_mode`; it does not look up registered rules. Concept defaults are provided by `defaultUiModeForConcept`, and the teacher may override the mode. The current routing is:

   | Question setting | Student interaction |
   | :--- | :--- |
   | `MODAL_VERB` | Modal-strength gauge |
   | `REDUCE` | Shredder-style reduction |
   | `MORPH` + tense, agreement, subjunctive, or conditional concept | Tense timeline |
   | `BUILD` | Magnetic sentence slots |
   | No concept or an unmatched combination | Legacy canvas |

   The gallery shows **illustrative UI mockups, not live application screenshots**. The student's actual canvas is routed as above; interaction tiles are selected by clicking, not dragging.

   | `BUILD` — assemble sentence chunks | `REDUCE` — remove unnecessary chunks |
   | :---: | :---: |
   | ![BUILD sentence assembly UI illustration](docs/images/grammar-build-ui.svg) | ![REDUCE sentence reduction UI illustration](docs/images/grammar-reduce-ui.svg) |

   | `MORPH` — select a tense or verb form | `MODAL_VERB` — choose a modal strength |
   | :---: | :---: |
   | ![Tense MORPH and sentence assembly UI illustration](docs/images/adaptive-grammar-game-ui.svg) | ![Modal verb strength gauge UI illustration](docs/images/grammar-modal-ui.svg) |
3. **Diagnosis:** After submission, `diagnoseGrammar` runs general validators plus validators registered for that question's concept. `grammarRules.ts` eagerly loads `src/rules/validators/*.ts`; each plugin calls `registerGrammarRule` with an ID, validator, and optional concept list. For example, conjunction rules target clause concepts, inversion targets question/inversion concepts, and modal-form checks target `MODAL_VERB`. A definite local signal drives the existing misconception feedback/logging; if no rule diagnoses the answer, token alignment classifies the difference, and an `UNKNOWN_ERROR` can enter the asynchronous AI fallback.

Therefore, adding a validator changes local diagnosis only. It does not automatically add a teacher form field or a new visual interaction; those require updates to the concept/type list, authoring controls, and/or canvas routing as appropriate. For a new validator, add a file under `src/rules/validators/` and register it; keep the ID unique.

### Does the current UI cover `Grammar_Scope.md`?

The authoring form exposes every concept listed in the scope, but that does **not** mean every grammatical distinction is modeled or diagnosed exhaustively. Current coverage is:

| Scope topic | Current interaction | Coverage and limitation |
| :--- | :--- | :--- |
| Sentence units, S/V/O/C, five sentence patterns | `BUILD` | Can assemble a keyed sentence; it does not label grammatical roles or model each pattern as a distinct task. |
| Subject-verb agreement; tense and aspect | `MORPH` or `BUILD` | Supports configured alternatives and exact-answer checking. Auto-generated forms use a small vocabulary; the timeline does not fully model all tense/aspect combinations. |
| Questions and inversion | `BUILD` | Can assemble a question/inverted sentence. Local inversion diagnosis is heuristic, not a general question parser. |
| Connectors; noun, adjective, and adverb clauses | `BUILD` / `REDUCE` | Can assemble or reduce teacher-authored chunks. Chunking uses a small phrase dictionary and does not represent clause boundaries or roles explicitly. |
| Subjunctive mood and conditionals | `MORPH` / `BUILD` | Can practice supplied forms and sentence order, but there is no dedicated two-clause conditional interaction; local mood diagnosis covers only narrow patterns. |
| Modal verbs (an additional concept beyond the current scope list) | Modal-strength gauge plus `BUILD` | The gauge presents an approximate strength order; it does not capture all context-dependent modal meanings. Local checking focuses on the base form after a modal. |

**Recommendation:** A new top-level game mode is not necessary to start teaching these topics: `BUILD`, `REDUCE`, and `MORPH` already provide the basic assemble/remove/change-form actions. However, the current UI is not enough to claim complete K–12 grammar coverage. Prioritize improvements within those modes—explicit S/V/O/C and clause scaffolds, richer tense/aspect choices, and paired-clause conditional prompts—along with broader validators. Add a separate game type only if those concepts need interaction that cannot be expressed as chunk assembly, removal, or form selection.

### Implementation and rollout status (2026-11-03)

The adaptive canvas, legacy adapter, local chunker and rule registry, asynchronous diagnosis flow, and teacher Realtime status display are implemented and pushed to `main`. The 20 legacy questions remain in their existing format; they are adapted when loaded into the canvas rather than rewritten in the `questions` table. Automated checks passed: 37 tests, TypeScript type-check, Vite production build, and Deno Edge Function type-check. The production build still reports a large main-bundle size warning.

**Supabase rollout is still pending.** The migration `supabase/migrations/20261103215800_async_diagnosis_status.sql` has not been applied, and the updated `grammar-assistant` Edge Function has not been deployed or verified against a live Supabase project. Apply the migration, deploy the function, and configure the Gemini key before enabling cloud diagnosis:

```bash
npx supabase db push
npx supabase functions deploy grammar-assistant
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

The migration adds `status` and `diagnosis` to `learning_logs` and enables Realtime updates for that table. Keep the Gemini key in Supabase Edge Function Secrets; never put it in `.env.local` or frontend code. Until the migration and function are deployed, AI error-matrix generation and asynchronous diagnosis are unavailable; deterministic chunking and local diagnosis remain available.

---

## 🛠️ Tech Stack & Engineering

- **Frontend**: Vue 3 (Composition API) + Vite + TypeScript
- **Backend & DB**: Supabase (PostgreSQL, Storage, Edge Functions, Realtime Presence)
- **Speech**: Deepgram API (via Edge Function proxy) + Native Web Speech API fallback
- **Drag & Drop**: Native Pointer Events & `vue-draggable-plus`

---

## 🚀 Getting Started

### Environment Setup
Create a `.env.local` file:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase Setup
1. Create a **Public** Storage bucket named `tts-audio`.
2. Create a table `classroom_state` and enable Realtime (`supabase_realtime`).
3. Apply the database migrations and deploy the Edge Functions:
   ```bash
   npx supabase db push
   npx supabase functions deploy deepgram-tts
   npx supabase functions deploy edge-stt
   npx supabase functions deploy teacher-action
   npx supabase functions deploy grammar-assistant
   ```
4. Set the Secrets:
   ```bash
   npx supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
   npx supabase secrets set TEACHER_PASSWORD=your_teacher_password
   npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
   ```

### Development & Testing
```bash
npm install
npm run dev
npm test
```