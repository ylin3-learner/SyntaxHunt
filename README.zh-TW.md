# 🕵️ Anime Character Hunter Lite（動漫角色大搜尋）

**[English](README.md) | [繁體中文](README.zh-TW.md)**

一套以「認知歷程管線」為核心、專為 K-12 設計的互動式英語文法學習工具。

本專案以 **Vue 3、TypeScript、Vite 與 Supabase** 打造，教學主題為**後位修飾（關係子句與介系詞片語）**，特別針對母語干擾（中文為前位修飾、英文為後位修飾）與結構性迷思（例如 `who she` 這類多餘代名詞）。

整體設計對應一節 45 分鐘的**國三（115 iE5 Unit 5：*The Man Who Shook Hands with Me Is My Favorite Star*）**課程。

---

## 🧠 認知歷程管線（以教學理論驅動的設計）

本工具建立在第二語言習得（SLA）理論上，包含三種獨立的題型，帶領學生完成認知循環：

```mermaid
flowchart TD
    Start((開始)) --> Preview
    
    subgraph Presentation ["1. 輸入與鷹架"]
        Preview["🔍 片語預覽<br>建立形式與意義連結"]
        Input["🎧 聽力輸入<br>測試聽覺理解"]
        Preview --> Input
    end

    Input --> Macro
    
    subgraph Practice ["2. 空間與形式"]
        Macro["🧩 巨觀拖拉<br>建立後位修飾空間感"]
        Micro["🧱 減法垃圾桶 (Trash Can)<br>視覺化文法迷思與 Gap"]
        Macro --> Micro
    end

    Micro --> Output
    
    subgraph Production ["3. 產出與反思"]
        Output["🗣️ 語音練習<br>STT 比對發音"]
        Noticing["💡 意識提升<br>自我歸納文法"]
        Output --> Noticing
    end

    Noticing --> End((完成關卡))

    %% 行為主義與班級經營
    Focus["⚠️ 防切屏 Beep 聲"] -.-> Practice
    Timer["⏱️ 限時壓力"] -.-> Practice
    Data["📊 即時錯誤軌跡"] -.-> Teacher((教師數據儀表板))
    Micro -.-> Data

    subgraph ClassroomMgmt ["🎓 班級經營 (全新功能)"]
        ClassMode["🔒 上課模式<br>鎖定學生進度"]
        Presence["📊 進度監控 (Presence)<br>即時統計完成人數"]
        SelfPace["🟢 自學模式<br>允許自由前進"]
    end

    ClassMode -.-> Practice
    Presence -.-> Teacher
    SelfPace -.-> Practice
```

1. **片語預習與測驗 (Chunk Phrase Quiz)**：學生看圖聽發音，從相似片語中選出正確的。
2. **空間建構 (Macro Drag)**：學生親手把「無文字標籤」的圖片塊拖過中線，建立英文後位修飾的空間語序感。
3. **標準題與轉換題 (Standard & Reduce)**：包含聽力輸入、聚焦形式（使用獨創的**減法垃圾桶**機制）、語音輸出與意識提升。

---

## 🏗️ 系統架構圖 (System Architecture)

本系統具備高度解耦特性，透過 **Supabase** 作為中樞，將前端 Vue 3 應用、教師端、以及外部的 AI 語音服務完美串接。

```mermaid
graph TD
    subgraph Client ["前端 (Vue 3 + TypeScript)"]
        direction TB
        AdminUI["👩‍🏫 教師備課中心<br>(TeacherAdmin.vue)"]
        StudentUI["👨‍🎓 學生學習介面<br>(App.vue)"]
        
        subgraph Composables ["核心邏輯 (Composables)"]
            Timer["⏱️ useQuizTimer<br>(絕對時間戳倒數)"]
            Focus["👁️ useFocusMonitor<br>(防切屏監控)"]
            Sound["🔊 useSound<br>(Web Audio 音效)"]
            Speech["🗣️ useSpeech<br>(跨平台語音代理)"]
            Sync["📡 useClassroomSync<br>(狀態同步 & Presence)"]
        end
    end

    subgraph Supabase ["Supabase 雲端後端"]
        DB[("PostgreSQL<br>(題庫、軌跡、課堂狀態)")]
        Realtime[("Realtime WebSocket<br>(Postgres Changes & Presence)")]
        Storage[("Storage<br>(圖片與音檔快取)")]
        
        subgraph EdgeFunctions ["Edge Functions (Deno)"]
            Action_Proxy["🛡️ teacher-action<br>(安全驗證與設定)"]
            TTS_Proxy["🔊 deepgram-tts<br>(Deepgram TTS)"]
            STT_Proxy["🎤 edge-stt<br>(Deepgram STT)"]
        end
    end

    subgraph ThirdParty ["第三方 API"]
        Deepgram["Deepgram API"]
    end

    %% 資料流
    AdminUI -- "1. 發送指令/設定 (帶密碼)" --> Action_Proxy
    Action_Proxy -- "2. 更新狀態" --> DB
    DB -- "3. 觸發 Postgres Changes" --> Realtime
    Realtime -- "4. 推送跳題/鎖定狀態" --> Sync
    Sync -- "5. 更新 UI 與計時器" --> StudentUI
    
    %% Presence 流
    StudentUI -- "作答進度 (Presence)" --> Realtime
    Realtime -- "即時人數統計" --> AdminUI
    
    AdminUI -- "CRUD" --> DB
    StudentUI -- "CRUD & Logs" --> DB
    
    StudentUI -- "語音合成請求" --> TTS_Proxy
    TTS_Proxy --> Deepgram
    TTS_Proxy -- "儲存快取" --> Storage
    
    StudentUI -- "語音辨識請求" --> STT_Proxy
    STT_Proxy --> Deepgram

    %% 邏輯依賴
    StudentUI -.-> Composables
    AdminUI -.-> Speech
```

---

## 🎙️ 跨平台混合式語音架構 (Hybrid TTS & STT)

為了確保在 iPad、一般電腦、以及**沒有語音包的智慧白板**上都能 100% 穩定運作，本專案實作了基於 Supabase Edge Functions 的降級備援機制。

- **文字轉語音 (TTS)**：優先偵測系統原生語音包。若無語音包（如 Windows 白板），則自動呼叫 `deepgram-tts` 代理。
- **語音轉文字 (STT)**：完全繞過瀏覽器 Web Speech API 的限制（如 Safari 的 `service-not-allowed`），將錄音檔傳送至 `edge-stt` 代理，交由 **Deepgram** 進行精準辨識。

---

## ⚡ 即時課堂互動時序圖 (Master-Slave, Presence & Anti-Cheat)

這張圖展示了最核心的「教師安全掌控」、「進度監控」與「防作弊」機制。

```mermaid
sequenceDiagram
    participant T as 👩‍🏫 老師 (Master)
    participant EF as 🛡️ Edge Function
    participant RT as 📡 Realtime (Presence & DB)
    participant S as 👨‍🎓 學生 A (Slave)
    participant S2 as 👨‍🎓 學生 B (Slave)

    Note over T,RT: 情境一：老師開啟「上課模式」並設定目標 30 人
    T->>EF: 開啟上課模式 (Target: 30)
    EF->>RT: 更新 classroom_state (is_class_mode = true)
    RT-->>S: 收到同步狀態 (isClassMode = true)
    RT-->>S2: 收到同步狀態 (isClassMode = true)

    Note over S,RT: 情境二：學生作答與 Presence 進度追蹤
    S->>S: 完成題目 (handleSuccess)
    S->>RT: track({ status: 'completed' })
    RT-->>T: 觸發 Presence Sync (更新完成人數: 1)
    RT-->>S2: (學生B 還在作答，狀態維持 answering)

    Note over S,T: 情境三：上課模式鎖定
    S->>S: 點擊「下一關」
    S-->>S: 按鈕 Disabled (等待老師發送)
    
    T->>EF: 點擊「🚀 發送」下一題
    EF->>RT: 更新題目 ID
    RT-->>S: 題目切換，狀態改回 answering
    RT-->>S2: 題目切換，狀態改回 answering
```

---

## ✨ 主要功能

### 給學生
- **減法垃圾桶 UI（Reduce 模式）**：學生點擊多餘的詞（如 `who`, `is`）丟進垃圾桶。視覺化看著句子縮短，親眼見證文法轉換的過程。
- **上課模式鎖定 (Class Mode Lock)**：當老師開啟上課模式時，「下一關」按鈕會被禁用，學生必須等待老師統一發送指令，確保全班節奏一致。
- **片語塊視覺化**：多字片語顯示為不可分割的藍色磚塊。
- **無標籤空間拼圖**：巨觀拖拉階段只顯示圖片，不顯示文字，避免洩題。
- **文字比對發音面板**：透過 Deepgram 辨識發音，精準畫線標示漏讀單字。

### 給老師（Teacher Admin）
- **進度監控面板 (Presence Dashboard)**：輸入目標人數，系統會即時統計「已完成人數」，並顯示高亮進度條（如 `5 / 30 人`），讓老師一眼掌握全班狀況。
- **上課模式開關 (Class Mode Toggle)**：一鍵鎖定全班進度，禁止學生偷跑。
- **漏斗式出題（Funnel Authoring）**：用 `[ ]` 框出要保留的片語，系統自動視覺化「保留」與「丟棄」的字。
- **主從遠端控制**：老師可一鍵推送題目、強制重置計時器，或隨時點擊 `+30s` 為全班加時。

---

## 🔬 診斷規則引擎

學生的錯誤會被歸類為**診斷碼**。文法規則是純函式，位於 `src/rules/grammarRules.ts`。

| 診斷碼 | 觸發情境 | 教學診斷意義 |
| :--- | :--- | :--- |
| `DUPLICATE_PRONOUN` | *who / which / that* 後面緊接主格代名詞。 | 學生尚未理解關代已代替先行詞。 |
| `SV_AGREEMENT` | 關代後的動詞與先行詞單複數不一致。 | 尚未掌握關係子句內的動詞呼應。 |
| `WRONG_RELATIVE` | 先行詞是物卻用 *who*，或人卻用 *which*。 | 無法依先行詞類型選擇關代。 |
| `NOT_REDUCED` | 轉換題中仍保留 *who / which / that*。 | 沒有把關係子句簡化為介系詞片語。 |
| `INCOMPLETE_REDUCTION` | 關代已刪除，但 be 動詞仍殘留。 | 刪了關代，卻忘了刪 be 動詞。 |
| `WRONG_ORDER` | 文法正確但字序錯誤。 | 語序錯亂或選錯連接詞。 |
| `PUZZLE_ERROR` | 拼圖塊未對準目標槽位。 | 缺乏後位修飾的空間位置感。 |

### 通用文法題與四層診斷

教師可新增「通用文法題」，選擇 `BUILD`、`REDUCE` 或 `MORPH`。字塊可由 AI 拆解，也可手動調整變形選項。作答診斷依序使用本地規則/LCS、`diagnosis_cache` 快取，最後才呼叫 Gemini；遠端診斷逾時 3 秒會提示學生先自行檢查答案。教師可在題目列建立常見錯誤矩陣，學情看板則依 SST 四類顯示錯誤比例。

啟用雲端 AI 與診斷快取前，先套用資料庫遷移、部署函式並設定 Gemini 金鑰：

```bash
npx supabase db push
npx supabase functions deploy grammar-assistant
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

Gemini 金鑰只設定在 Supabase Edge Function Secrets，不要放入 `.env.local` 或前端程式碼。未部署函式或未設定金鑰時，AI 拆解/兜底診斷會顯示明確錯誤；本地診斷仍可使用。

---

## 🛠️ 技術棧與工程

- **前端**：Vue 3（Composition API）+ Vite + TypeScript
- **後端與資料庫**：Supabase（PostgreSQL、Storage、Edge Functions、Realtime Presence）
- **語音 (TTS & STT)**：Deepgram API（透過 Edge Function 代理）+ Web Speech API 降級備援
- **拖曳**：原生 Pointer Events 與 `vue-draggable-plus`

---

## 🚀 快速開始

### 環境設定
建立 `.env.local` 檔案：
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase 設定
1. 建立名為 `tts-audio` 的 **Public** Storage bucket。
2. 建立 `classroom_state` 資料表並開啟 Realtime (`supabase_realtime`)。
3. 部署 Edge Functions：
   ```bash
   npx supabase functions deploy deepgram-tts
   npx supabase functions deploy edge-stt
   npx supabase functions deploy teacher-action
   ```
4. 設定 Secrets（API 金鑰與教師密碼）：
   ```bash
   npx supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
   npx supabase secrets set TEACHER_PASSWORD=your_teacher_password
   ```

### 開發與測試
```bash
npm install
npm run dev
npm test
```