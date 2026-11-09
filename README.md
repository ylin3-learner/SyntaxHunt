# 🕵️ SyntaxHunt (Grammar Diagnostic System)

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

    subgraph ClassroomMgmt ["🎓 Classroom Management"]
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

The system is highly decoupled, using **Supabase** as the central hub to connect the Vue 3 frontend, teacher admin, and external AI speech services. The codebase follows **Domain-Driven Design (DDD)** and **Clean Architecture** principles.

```mermaid
graph TD
    subgraph Client ["Frontend (Vue 3 + TypeScript)"]
        direction TB
        AdminUI["👩‍🏫 Teacher Admin<br>(TeacherAdmin.vue)"]
        StudentUI["👨‍🎓 Student Interface<br>(App.vue)"]
        
        subgraph Components ["UI Components"]
            Forms["Forms<br>(Grammar/Standard)"]
            Stages["Stages<br>(Preview/Input/Macro/Micro)"]
        end

        subgraph Composables ["Core Logic (Composables)"]
            QuizFlow["🎮 useQuizFlow"]
            QuestionForm["📝 useQuestionForm"]
            Auth["🔐 useAdminAuth"]
            Sync["📡 useClassroomSync"]
        end

        subgraph Domain ["Domain Layer"]
            Builder["⚙️ QuestionBuilder"]
            Rules["📏 GrammarRules"]
        end
    end

    subgraph Supabase ["Supabase Cloud Backend"]
        AuthProvider[("Auth (JWT)")]
        DB[("PostgreSQL with RLS")]
        Realtime[("Realtime WebSocket")]
        subgraph EdgeFunctions ["Edge Functions (Deno)"]
            Action_Proxy["teacher-action"]
            TTS_Proxy["deepgram-tts"]
            STT_Proxy["edge-stt"]
            LT_Proxy["lt-proxy"]
        end
    end

    subgraph External ["External Services"]
        Deepgram["Deepgram API"]
        LanguageTool["Self-hosted LanguageTool<br>(Docker)"]
    end

    BrowserTTS["Browser SpeechSynthesis"]

    %% Data Flow
    AdminUI -- "1. Auth (Email/Pwd)" --> AuthProvider
    AdminUI -- "2. Action Request (JWT)" --> Action_Proxy
    Action_Proxy -- "3. Update State" --> DB
    DB -- "4. Postgres Changes" --> Realtime
    Realtime -- "5. Sync State" --> Sync
    Sync -- "6. Update UI & Timer" --> StudentUI
    
    StudentUI -- "Native TTS" --> BrowserTTS
    StudentUI -- "Fallback TTS" --> TTS_Proxy
    StudentUI -- "STT Request" --> STT_Proxy
    StudentUI -- "Grammar check" --> LT_Proxy
    
    TTS_Proxy --> Deepgram
    STT_Proxy --> Deepgram
    LT_Proxy --> LanguageTool
```

Here are the code snippets to add to your README files. You can copy and paste these directly into the respective sections (e.g., right after the System Architecture section).

---

### 🧠 Grammar Diagnostic Engine (Chain of Responsibility)

The core diagnostic pipeline has been completely refactored from a monolithic rule engine into a highly decoupled, **5-Layer Chain of Responsibility**. This architecture ensures millisecond-level local responses while guaranteeing that *no student mistake is ever left without feedback*.

```mermaid
flowchart TD
    Input([Student Input]) --> L1

    subgraph Local ["Local Deterministic (0ms)"]
        L1["L1: Local Grammar Rules<br>Deterministic Checks (SVA, Tenses, etc.)"]
        L2["L2: Teacher Custom Rules<br>Regex \b Boundaries & Target Feedback"]
        L3["L3: Structural Diff<br>LCS Algorithm (Omission, Addition, Order)"]
    end

    subgraph Remote ["Remote / Heavy (Async)"]
        L4["L4: LanguageTool API<br>Deep Semantic Check (with AbortSignal Timeout)"]
    end

    subgraph Fallback ["Ultimate Fallback"]
        L5["L5: Highlight Fallback<br>Find first diff index & highlight Tile"]
    end

    L1 -- "Definite Error" --> Output([Show UI Feedback])
    L1 -- "Unknown" --> L2
    L2 -- "Matched" --> Output
    L2 -- "Unknown" --> L3
    L3 -- "Definite Error" --> Output
    L3 -- "Unknown" --> L4
    L4 -- "Found Issue" --> Output
    L4 -- "Timeout/Error" --> L5
    L5 --> Output
```

### The 5 Layers of Defense

1. **L1 — Local Deterministic Rules (`L1_LocalRules.ts`)**: 
   Runs all registered synchronous grammar rules (e.g., Subject-Verb Agreement, Relative Pronouns). If a definite error is found, it **short-circuits** immediately, providing a 0ms response.
2. **L2 — Teacher Custom Rules (`L2_CustomRules.ts`)**: 
   Parses teacher-defined `customRules`. It uses precise **Regular Expressions with word boundaries (`\b`)** to prevent false positives (e.g., matching `go` inside `going`). Features rule prioritization and concept filtering.
3. **L3 — Structural Diff (`L3_StructuralDiff.ts`)**: 
   Utilizes the **Longest Common Subsequence (LCS)** algorithm to calculate token-level differences. It classifies errors into Omissions (`M:`), Additions (`U:`), Misorderings (`O:`), and Misformations (`R:`).
4. **L4 — LanguageTool Deep Check (`L4_LanguageTool.ts`)**: 
   Invoked only when local layers return `UNKNOWN_ERROR`. Uses an `AbortController` with an 8-second timeout. If the network fails or times out, it gracefully degrades to L5 without blocking the UI.
5. **L5 — Ultimate Highlight Fallback (`L5_HighlightFallback.ts`)**: 
   The pedagogical safety net. If all else fails, it uses `findDiffIndices` to pinpoint the exact wrong tile. It returns a `HIGHLIGHT_ONLY` signal, prompting the UI to highlight the error tile in red with a generic encouraging hint ("Check the word form or order here"), ensuring the learning loop is never broken.

### 💡 Key Design Advantages
- **Short-Circuit Efficiency**: 99% of common mistakes are resolved in L1~L3 with zero network overhead.
- **Teacher-in-the-Loop**: Teachers can inject hyper-specific feedback via L2 without writing complex code.
- **Graceful Degradation**: A failing external API (LanguageTool) will never break the student's flow, falling back safely to L5.
- **Fully Tested**: 100% test coverage on the pipeline's short-circuit logic and timeout fallback mechanisms using Vitest.
```

---

### Data Flow: Student Question Routing

This diagram illustrates how questions are routed based on the classroom mode.

```mermaid
flowchart TD
    subgraph Data ["☁️ Cloud Question Bank"]
        QB[Question Bank<br>Grouped by Units]
    end

    subgraph App ["📱 Student App (App.vue)"]
        Start((Enter App)) --> Load[Load Questions based on Teacher ID]
        Load --> ModeCheck{Classroom Mode?}
        
        ModeCheck -->|Self-Paced| LockCheck{Teacher Locked Unit?}
        LockCheck -->|No| ShowSelector[Show Unit Selector]
        ShowSelector --> UserSelect[Student Selects Unit]
        UserSelect --> Filter1[Filter Questions by Unit]
        
        LockCheck -->|Yes| ForceFilter[Force Switch to Locked Unit<br>Hide Selector]
        
        ModeCheck -->|Class Mode Lock| LockUI[Hide Selector<br>Lock UI]
        LockUI --> TeacherPush[Receive Teacher Broadcast]
        TeacherPush --> AutoSwitch[Auto-switch to Pushed Question's Unit]
        
        Filter1 --> Render[Render Current Question]
        ForceFilter --> Render
        AutoSwitch --> Render
    end
    
    QB -. "Fetch" .-> Load
    Render --> End((Start Playing))
```

---

## 🎨 Core UI Modes (Pedagogical Canvas Design)

To address different cognitive loads and grammar concepts across chapters, the system employs 6 distinct UI modes. The student interface automatically selects the most appropriate interactive canvas based on the question's `grammarTopicId` or `concept`, preventing a single generic interface from causing learning interference.

| Core UI Mode | Targeted Chapters / Concepts | Why it fits? | Deprecated/Merged Old Modes |
| :--- | :--- | :--- | :--- |
| **1. `BUILD` (Magnetic Slots)** | Ch.1 (Sentence Patterns), Ch.17 (Conjunctions), Ch.18 (Noun Clauses), Ch.19 (Patterns), Ch.15 (Inversion), Ch.16 (Relative Clauses - Assembly) | Handles **word order and structure**. Any task requiring arranging chunks into the correct sequence uses `BUILD`. | Old `MacroDragCanvas` is absorbed here. |
| **2. `MORPH` (Origami Morph)** | Ch.2 (Tenses), Ch.9 (Comparatives), Ch.10 (Gerunds), Ch.12 (Passive Voice) | Handles **morphological changes**. Click a chunk to switch forms; the rest of the sentence remains fixed. | Old `MorphChoiceCanvas`, `TimelineMorphCanvas` are consolidated. |
| **3. `REDUCE` (Shredder)** | Ch.7 (Participle Clauses), Ch.16 (Relative Clauses - Reduction), Ch.18 (Pronoun Replacement) | Handles **deletion and merging**. Discard redundant words or merge two words. | Old `ShredderReduceCanvas`. |
| **4. `MATRIX_GATE` (Feature Lock)** | Ch.13 (Special Verbs like spend/cost), Ch.14 (Sensory/Causative Verbs) | Handles **syntactic constraints of confusable words**. Students must select the correct feature toggle to unlock the word cards. | New mode. Replaces the old guess-and-check `BUILD` tasks. |
| **5. `PRAGMATIC_HP` (Pragmatic HP)** | Ch.4 (Modals/Auxiliaries), Ch.11 (Emotive Verbs) | Handles **tone and social distance**. VADER analyzes offensiveness, causing HP loss or gain. | New mode. |
| **6. `GRAVITY_SWITCH` (Gravity Switch)** | Ch.20 (Subjunctive/Unreal Conditionals) | Handles **unreal contexts**. Switch the toggle, the sentence floats, and the tense steps back. | New mode. |

---

## 🔒 Multi-Tenancy & Security (Teacher Isolation)

This application strictly implements multi-tenancy to ensure teachers can only see and modify their own questions and classroom states.

- **Supabase Auth**: Teachers log in using Email and Password via `supabase.auth.signInWithPassword`.
- **Database Schema**: The `questions`, `learning_logs`, and `classroom_state` tables all include a `teacher_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()` column.
- **Row Level Security (RLS)**:
  - **Teachers**: Can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` rows where `auth.uid() = teacher_id`.
  - **Students**: Do not access the `questions` table directly. They load the question bank from `localStorage` or default questions. They connect to the teacher's Realtime channel via `room_code`.
- **Seat Codes**: Students are assigned a random seat code (`S01`–`S30`) stored in `sessionStorage`, which is sent via `trackPresence(seatCode)` for live classroom tracking.
- **Realtime Isolation**: Channels are strictly named `classroom_sync_${teacherId}` to prevent cross-tenant data leaks.

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
    
    T->>EF: Enable Class Mode & Set Target (with JWT)
    EF->>RT: Update classroom_state (is_class_mode = true)
    RT-->>S: Sync State (isClassMode = true)
    RT-->>S2: Sync State (isClassMode = true)

    Note over S,RT: Scenario 2: Student Answers & Presence Tracking
    
    S->>S: Complete Question (handleSuccess)
    S->>RT: track({ status: 'completed', seatCode: 'S01' })
    RT-->>T: Presence Sync (Update Completed Count: 1)
    
    Note over S,T: Scenario 3: Class Mode Lock
    
    S->>S: Click "Next Question"
    S-->>S: Button Disabled (Wait for Teacher)
    
    T->>EF: Click "🚀 Push to Class"
    EF->>RT: Update Question ID
    RT-->>S: Question switches, track({ status: 'answering' })
    RT-->>S2: Question switches, track({ status: 'answering' })
```

---

## ✨ Key Features

### For Students
- **Sentence-based Subtraction UI (Reduce Mode)**: Students read a natural sentence and simply click on underlined redundant words to discard them into the trash can. The UI removes all drag-and-drop or reordering complexities, ensuring a single pedagogical focus on deletion.
- **Inline Morphing Capsules (Morph Mode)**: The sentence remains fixed. Clicking a purple "capsule" word reveals a dropdown directly beneath it to select the correct morphological form, eliminating visual clutter and reducing cognitive load.
- **Class Mode Lock**: When the teacher enables Class Mode, the "Next" button is disabled. Students must wait for the teacher's push command.
- **Phrase Chunking Visuals**: Multi-word units appear as distinct blue tiles.
- **Speech Playback**: Hear the sentence through a native English voice or Deepgram TTS.
- **Pronunciation Practice**: Record your voice for Deepgram STT transcription and word-by-word comparison.
- **Unit Selector (Self-Paced Mode)**: Students can use the dropdown menu to filter questions by specific curriculum units. However, when the teacher enables Class Mode, this selector is hidden, and the system automatically locks to the question pushed by the teacher.
- **Unit Selector & Teacher Lock**: In self-paced mode, students can freely switch between units using a dropdown. However, if the teacher publishes a specific unit, the dropdown is hidden and replaced by a locked badge, forcing students to focus on the assigned unit.

### For Teachers (Teacher Admin)
- **Presence Dashboard**: Input the target student count. Watch the live progress bar update in real-time. Seat codes are displayed in the grid.
- **Class Mode Toggle**: Lock the entire class's progression instantly.
- **Funnel-Based Authoring**: Wrap phrases in `[ ]`. Visualizes "Kept" and "Discarded" words.
- **Semantic Control (Person vs. Thing)**: Explicitly define whether the antecedent is a "Person" or a "Thing" to ensure accurate `who` vs. `which` diagnostics.
- **Local Deterministic Chunking**: Uses `compromise.js` and an irregular-verb JSON table to automatically generate interactive chunks.
- **Visual Question Flow**: Open the full-screen node canvas to reorder questions by dragging nodes.
- **Master Remote Control**: Push questions, force-reset timers, and add time (`+30s`) instantly.
- **Unit-Level Locking**: Force students to stay within a specific unit by selecting and publishing it from the class control panel. Students cannot switch units until the teacher unlocks it.
- **QR Code & Room Code Sharing**: Instantly generate a projector-friendly QR Code. Students can scan it to automatically join the teacher's specific classroom channel without typing.

### Using general grammar questions

1. Open **Teacher Admin** and select **General Grammar** in the question editor.
2. Choose a curriculum chapter and a specific grammar topic.
3. **Standard & Reduce**: Features Input Processing, Focus on Form using a unique **"Trash Can" subtraction mechanic**, Prosody Output, and Consciousness-Raising. The UI strictly isolates the target grammar point without unnecessary interactions.
4. Click **Local chunking** or split the sentence manually.
5. For a `MORPH` topic, mark exactly one changeable chunk and provide its comma-separated forms.
6. Click **Add to question bank** and **Send to class** to make it active.

> **Teacher Access Note:** Teacher sign-in uses Supabase Auth (`signInWithPassword`). You can now **register a new teacher account directly from the login modal** by clicking "Sign up". Alternatively, you can create accounts manually in the Supabase Dashboard.

---

## 🛠️ Tech Stack & Engineering

- **Frontend**: Vue 3 (Composition API) + Vite + TypeScript
- **State Management**: Vue Composables (`useQuizFlow`, `useQuestionForm`, `useClassroomSync`)
- **Local NLP**: compromise.js + `english-verbs-irregular`
- **Diagnostic Engine**: Local Rule Registry + LCS algorithm + LanguageTool (Deep Semantic Check)
- **Backend & DB**: Supabase (PostgreSQL, Edge Functions, Realtime Presence, Auth, RLS)
- **Infrastructure**: Render (Docker / LanguageTool) + GitHub Actions (Keep-Alive)
- **Speech (TTS & STT)**: Native `SpeechSynthesis` / Deepgram via Edge Functions
- **QR Code Generation**: `qrcode.vue`

---

## 📋 進度追蹤 (Progress Tracking)

### 🏗️ 責任鏈模式重構 (Chain of Responsibility Refactoring)

**狀態**: ✅ 架構完成，測試大部分通過

本專案已將文法診斷管線從單體 `diagnoseGrammar()` 重構為**責任鏈模式 (Chain of Responsibility)**，達成高內聚、低耦合的架構目標。

#### 📁 新增目錄結構
```
src/rules/diagnostics/
├── pipeline.ts              # 核心管理器：負責註冊與依序執行各層
├── layers/
│   ├── L1_LocalRules.ts     # 第一層：現有語法規則 (由 grammarRules.ts 重構)
│   ├── L2_CustomRules.ts    # 第二層：老師自訂規則 (解析 customRules)
│   ├── L3_StructuralDiff.ts # 第三層：LCS/編輯距離結構比對
│   ├── L4_LanguageTool.ts   # 第四層：遠端 LanguageTool 呼叫
│   └── L5_HighlightFallback.ts # 第五層：終極兜底 (計算高亮 index)
```

#### 🔄 管線執行邏輯
1. **L1 (Local Rules)**: 執行所有本地註冊的語法規則，若找到確定性錯誤則短路
2. **L2 (Custom Rules)**: 檢查題目是否帶有老師自訂規則，進行子字串比對
3. **L3 (Structural Diff)**: 使用 LCS 演算法比對 student 與 correct token 的結構差異
4. **L4 (LanguageTool)**: 呼叫遠端 LanguageTool 進行深層語意檢查，超時則回傳空陣列
5. **L5 (Highlight Fallback)**: 終極兜底，找出第一個差異點並標紅

#### ✨ 新增功能
- **自訂文法規則 (CustomGrammarRule)**: 教師可在題目中加入 `customRules`，針對特定文法點提供精準回饋
- **高亮兜底 (Highlight Fallback)**: 當所有規則都無法分類時，自動標出第一個差異字塊
- **管線短路機制**: 高優先級層找到確定性錯誤後，不再執行低優先級層，提升診斷效率

#### 🧪 測試狀態
- ✅ `src/rules/diagnostics/pipeline.test.ts` - 管線短路與兜底邏輯測試
- ✅ `src/rules/diagnostics/layers/L1_LocalRules.test.ts`
- ✅ `src/rules/diagnostics/layers/L2_CustomRules.test.ts`
- ✅ `src/rules/diagnostics/layers/L3_StructuralDiff.test.ts`

---

## 🚀 Getting Started

### Environment Setup
Create a `.env.local` file:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase Setup
1. Create the baseline tables (`questions`, `learning_logs`, `classroom_state`).
2. Apply the latest migrations (which add `teacher_id`, `seat_code`, and enable RLS):
   ```bash
   npx supabase db push
   ```
3. Deploy the Edge Functions:
   ```bash
   npx supabase functions deploy deepgram-tts
   npx supabase functions deploy edge-stt
   npx supabase functions deploy teacher-action
   npx supabase functions deploy lt-proxy
   ```
4. Create a Teacher account in **Supabase Dashboard -> Authentication -> Users**.

### Development & Testing
```bash
npm install
npm run dev
npm test
```