# 🕵️ SyntaxHunt (文法出題診斷系統)

**[English](README.md) | [繁體中文](README.zh-TW.md)**

An interactive, cognitive-pipeline-driven English grammar learning tool designed for K-12 education.

Built with **Vue 3, TypeScript, Vite, and Supabase**, this application takes a pedagogical approach to teaching **Post-modifiers (Relative Clauses & Prepositional Phrases)**, specifically targeting the common L1 interference (Chinese pre-modifiers vs. English post-modifiers), structural misconceptions (e.g., redundant pronouns like `who she`), and **Phrase Chunking**. Teachers can also author general grammar questions in `BUILD`, `REDUCE`, or `MORPH` mode; answers are checked by a local rule engine first, with self-hosted LanguageTool providing additional diagnostics when local rules cannot classify an incorrect answer.

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
            LT_Proxy["lt-proxy<br>(LanguageTool grammar diagnosis)"]
        end
    end

    subgraph ThirdParty ["Third-Party API"]
        Deepgram["Deepgram API"]
        LanguageTool["Self-hosted LanguageTool<br>(Google Cloud Run)"]
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
    StudentUI -- "Advanced grammar check" --> LT_Proxy
    LT_Proxy --> LanguageTool

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
- **Visual Question Flow**: Open a full-screen node canvas to see the question sequence as connected steps. Drag nodes before or after other questions to reorder them; `Alt` + `←` / `→` also moves the focused node. Click **Finish prep** to save the order to the cloud so it persists after a refresh.
- **Master Remote Control**: Push questions, force-reset timers, and add time (`+30s`) instantly.

### Using general grammar questions

1. Open **Teacher Admin** and select **General Grammar** in the question editor.
2. Choose a grammar concept and interaction mode. The concept supplies a default mode, which can be changed.
3. Enter the source sentence and the exact target answer. For `REDUCE`, enter the complete sentence as the source and the reduced sentence as the answer.
4. Click **Local chunking** or split the sentence manually. Bracket a multi-word chunk in the source, e.g. `[in a blue uniform]`. Review the generated chips and edit the chunks before using them.
5. For `MORPH`, mark each changeable chunk and provide its comma-separated forms (e.g. `go, goes, went`). Chunking uses compromise.js and an irregular-verb JSON table; add or correct forms manually when needed.
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
| `UNKNOWN_ERROR` | — | Local rules cannot assign a specific error; LanguageTool is asked for additional suggestions. |

Local diagnoses retain their K-12 error codes and SST category (`Omission`, `Addition`, `Misformation`, or `Misordering`). If local rules cannot classify an incorrect answer, the app requests LanguageTool through the `lt-proxy` Supabase Edge Function. The LanguageTool message, category, rule ID, replacements, and character range are retained as native diagnostics; character offsets are mapped back to visible chunks for highlighting. A three-second timeout or service failure displays a neutral notice and lets the student skip to the next question. In `BUILD` and `MORPH`, students can also check a partial answer before filling every slot.

Teacher-authored general grammar questions choose a concept and interaction mode. `autoChunk(sentence, concept)` uses compromise.js for deterministic tokenization and verb parsing, checks the irregular-verb table first, and preserves bracketed phrases as explicit chunks. It does not call an LLM. MORPH options are stored as strings with `current_index` identifying the initial selected form, while legacy `morph_options` remains supported. The canvas routes new concepts to a timeline, modal-strength gauge, shredder, or magnetic-slot interaction. Questions without a concept keep the legacy canvas.

### How the Rule Registry connects authoring, gameplay, and diagnosis

The registry is the **local diagnosis plugin point**, not the question authoring UI router:

1. **Authoring:** In Teacher Admin, the teacher selects a grammar concept and `BUILD`, `REDUCE`, or `MORPH`, enters a sentence and answer, then uses local `autoChunk` (or edits the chunks and morphology options). The chosen concept and mode are saved with the question. `autoChunk` does not consult the Rule Registry.
2. **Gameplay UI:** `GrammarCanvas.vue` selects a canvas from the saved `concept` and `ui_mode`; it does not look up registered rules. Concept defaults are provided by `defaultUiModeForConcept`, and the teacher may override the mode. The current routing is:

   | Question setting | Student interaction |
   | :--- | :--- |
   | `MODAL_VERB` | Modal-strength gauge |
   | `REDUCE` | Shredder-style reduction |
   | `MORPH` + tense, agreement, subjunctive, or conditional concept | Tense timeline |
   | `BUILD` | Magnetic sentence slots |
   | No concept or an unmatched combination | Legacy canvas |

   The gallery shows **illustrative UI mockups, not live application screenshots**. The student's actual canvas is routed as above; tiles are selected by clicking rather than dragging, and retained `REDUCE` tiles can be reordered with their arrow controls.

   | `BUILD` — assemble sentence chunks | `REDUCE` — remove unnecessary chunks |
   | :---: | :---: |
   | ![BUILD sentence assembly UI illustration](docs/images/grammar-build-ui.svg) | ![REDUCE sentence reduction UI illustration](docs/images/grammar-reduce-ui.svg) |

   | `MORPH` — select a tense or verb form | `MODAL_VERB` — choose a modal strength |
   | :---: | :---: |
   | ![Tense MORPH and sentence assembly UI illustration](docs/images/adaptive-grammar-game-ui.svg) | ![Modal verb strength gauge UI illustration](docs/images/grammar-modal-ui.svg) |
3. **Diagnosis:** After submission, `diagnoseGrammar` runs general validators plus validators registered for that question's concept. `grammarRules.ts` eagerly loads `src/rules/validators/*.ts`; each plugin calls `registerGrammarRule` with an ID, validator, and optional concept list. For example, conjunction rules target clause concepts, inversion targets question/inversion concepts, and modal-form checks target `MODAL_VERB`. A definite local signal drives the existing misconception feedback/logging; if local rules cannot classify the incorrect answer, LanguageTool is called through the Supabase `lt-proxy` Edge Function and its native result is retained.

Therefore, adding a validator changes local diagnosis only. It does not automatically add a teacher form field or a new visual interaction; those require updates to the concept/type list, authoring controls, and/or canvas routing as appropriate. For a new validator, add a file under `src/rules/validators/` and register it; keep the ID unique.

### Does the current UI cover `Grammar_Scope.md`?

The authoring form exposes every concept listed in the scope, but that does **not** mean every grammatical distinction is modeled or diagnosed exhaustively. Current coverage is:

| Scope topic | Current interaction | Coverage and limitation |
| :--- | :--- | :--- |
| Sentence units, S/V/O/C, five sentence patterns | `BUILD` | Can assemble a keyed sentence; it does not label grammatical roles or model each pattern as a distinct task. |
| Subject-verb agreement; tense and aspect | `MORPH` or `BUILD` | Supports configured alternatives and exact-answer checking. Auto-generated forms use a small vocabulary; the timeline does not fully model all tense/aspect combinations. |
| Questions and inversion | `BUILD` | Can assemble a question/inverted sentence. Local inversion diagnosis is heuristic, not a general question parser. |
| Connectors; noun, adjective, and adverb clauses | `BUILD` / `REDUCE` | Can assemble or reduce teacher-authored chunks. Deterministic tokenization does not identify clause boundaries or grammatical roles; teachers can bracket phrases and edit the generated chunks. |
| Subjunctive mood and conditionals | `MORPH` / `BUILD` | Can practice supplied forms and sentence order, but there is no dedicated two-clause conditional interaction; local mood diagnosis covers only narrow patterns. |
| Modal verbs (an additional concept beyond the current scope list) | Modal-strength gauge plus `BUILD` | The gauge presents an approximate strength order; it does not capture all context-dependent modal meanings. Local checking focuses on the base form after a modal. |

**Recommendation:** A new top-level game mode is not necessary to start teaching these topics: `BUILD`, `REDUCE`, and `MORPH` already provide the basic assemble/remove/change-form actions. However, the current UI is not enough to claim complete K–12 grammar coverage. Prioritize improvements within those modes—explicit S/V/O/C and clause scaffolds, richer tense/aspect choices, and paired-clause conditional prompts—along with broader validators. Add a separate game type only if those concepts need interaction that cannot be expressed as chunk assembly, removal, or form selection.

### Implementation and rollout status (2026-11-05)

The adaptive canvas, legacy adapter, compromise.js chunker, local rule engine, and LanguageTool diagnosis path are implemented. For an incorrect answer without a definite local diagnosis, the browser calls the Supabase `lt-proxy` Edge Function, which forwards the text to the configured Cloud Run LanguageTool endpoint and returns native matches for display and logging. The proxy handles browser `POST` preflight requests and returns an explicit configuration error if `LANGUAGETOOL_URL` is missing. Legacy questions are adapted when loaded into the canvas rather than rewritten in the `questions` table.

After the teacher password is accepted, the app automatically sends a short, valid sentence through the same LanguageTool proxy to warm the service. This request does not create a learning log and does not block teacher access if it fails.

The code path is integrated, but this repository cannot confirm whether the hosted Supabase project and Cloud Run service are configured and reachable. To enable the deployed path, apply the migrations, set `LANGUAGETOOL_URL` to the actual Cloud Run LanguageTool `/v2/check` endpoint, and deploy the proxy:

```bash
npx supabase db push
npx supabase secrets set LANGUAGETOOL_URL=https://lt-proxy-xxx.run.app/v2/check
npx supabase functions deploy lt-proxy
```

The LanguageTool migration adds `source`, `category`, and `rule_id` to `learning_logs` and removes the obsolete diagnosis cache. The frontend calls only the Supabase proxy; it does not connect to Cloud Run directly. Replace the example `lt-proxy-xxx.run.app` host above with the real endpoint.

---

## 🛠️ Tech Stack & Engineering

- **Frontend**: Vue 3 (Composition API) + Vite + TypeScript
- **Local NLP**: compromise.js + `english-verbs-irregular`
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
   npx supabase functions deploy lt-proxy
   ```
4. Set the Secrets:
   ```bash
   npx supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
   npx supabase secrets set TEACHER_PASSWORD=your_teacher_password
   npx supabase secrets set LANGUAGETOOL_URL=https://lt-proxy-xxx.run.app/v2/check
   ```

### Development & Testing
```bash
npm install
npm run dev
npm test
```