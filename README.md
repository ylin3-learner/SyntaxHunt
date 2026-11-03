# 🕵️ Anime Character Hunter Lite

**[English](README.md) | [繁體中文](README.zh-TW.md)**

An interactive, cognitive-pipeline-driven English grammar learning tool designed for K-12 education.

Built with **Vue 3, TypeScript, Vite, and Supabase**, this application takes a pedagogical approach to teaching **Post-modifiers (Relative Clauses & Prepositional Phrases)**, specifically targeting the common L1 interference (Chinese pre-modifiers vs. English post-modifiers), structural misconceptions (e.g., redundant pronouns like `who she`), and **Phrase Chunking**.

It is designed around a single 45-minute lesson for **Grade 9 (115 iE5, Unit 5: *The Man Who Shook Hands with Me Is My Favorite Star*)**, covering Grammar Focus 1 (prepositional phrases), Grammar Focus 2 (subject relative clauses with *who / which / that*), and the p.107 Read activity.

---

## 🧠 The Cognitive Pipeline (Pedagogy-Driven Design)

This app is built upon Second Language Acquisition (SLA) theories and features **three distinct question types**, guiding students through a specific cognitive loop:

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

---

## 🔬 Diagnostic Rule Engine

| Code | Triggered when | What it tells the teacher |
| :--- | :--- | :--- |
| `DUPLICATE_PRONOUN` | A subject pronoun follows *who / which / that*. | The student doesn't see the relative pronoun replaces the noun. |
| `SV_AGREEMENT` | The verb disagrees with the antecedent's number. | The student hasn't mastered verb agreement. |
| `WRONG_RELATIVE` | *who* for a thing, or *which* for a person. | The student can't choose the pronoun by antecedent type. |
| `NOT_REDUCED` | In a **reduce** question, the relative pronoun is still present. | The student didn't apply the conversion. |
| `INCOMPLETE_REDUCTION` | The pronoun is gone but a *be* verb is left. | The student removed the pronoun but not the *be* verb. |
| `WRONG_ORDER` | Grammar is fine but tile order differs. | Word order is off. |
| `PUZZLE_ERROR` | Puzzle piece misses the target slot. | Lacks spatial sense of post-modification. |

### General Grammar Questions & Four-Layer Diagnosis

Teachers can create a **General Grammar Question** in `BUILD`, `REDUCE`, or `MORPH` mode. Chunks can be generated with AI and adjusted manually, including morph options. Student diagnosis checks local rules/LCS first, then `diagnosis_cache`, and calls Gemini only as a fallback. Remote diagnosis times out after three seconds and asks the student to review the answer. Teachers can prebuild likely-error matrices; analytics shows the four SST categories.

Apply the database migration, deploy the function, and configure the Gemini key:

```bash
npx supabase db push
npx supabase functions deploy grammar-assistant
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

Keep the Gemini key in Supabase Edge Function Secrets; never put it in `.env.local` or frontend code. Without the deployed function/key, AI chunk generation and fallback diagnosis report an explicit error while local diagnosis remains available.

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
3. Deploy the Edge Functions:
   ```bash
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