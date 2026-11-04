# 🕵️ Anime Character Hunter Lite（動漫角色大搜尋）

**[English](README.md) | [繁體中文](README.zh-TW.md)**

一套以「認知歷程管線」為核心、專為 K-12 設計的互動式英語文法學習工具。

本專案以 **Vue 3、TypeScript、Vite 與 Supabase** 打造，教學主題為**後位修飾（關係子句與介系詞片語）**，特別針對母語干擾（中文為前位修飾、英文為後位修飾）與結構性迷思（例如 `who she` 這類多餘代名詞）。教師也可建立 `BUILD`、`REDUCE` 或 `MORPH` 通用文法題，並透過本地規則引擎、診斷快取及 AI 兜底辨識作答錯誤。

範例課程以一節 45 分鐘的**國三（115 iE5 Unit 5：*The Man Who Shook Hands with Me Is My Favorite Star*）**為設計情境。

---

## 🧠 認知歷程管線（以教學理論驅動的設計）

本工具建立在第二語言習得（SLA）理論上。範例課程透過輸入到輸出的教學流程，帶領學生完成認知循環：

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
4. **通用文法畫布 (General Grammar Canvas)**：教師可另建 `BUILD`（組合字塊）、`REDUCE`（刪除多餘字塊）及 `MORPH`（切換字形）題型。

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
            Grammar_Proxy["🧩 grammar-assistant<br>(AI 錯誤矩陣與診斷)"]
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
    AdminUI -- "產生字塊與錯誤矩陣" --> Grammar_Proxy
    StudentUI -- "診斷兜底" --> Grammar_Proxy

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

### 如何使用通用文法題

1. 開啟 **教師備課中心**，在題目編輯器選擇 **通用文法題**。
2. 選擇文法概念與互動模式。系統會依概念預設模式，也可以自行切換。
3. 輸入來源句與精確的正確答案。`REDUCE` 的來源句填完整句，答案填刪減後的句子。
4. 點選 **確定性自動拆解**，或手動拆解句子。若要將多個字詞視為一塊，請在來源句用中括號標示，例如 `[in a blue uniform]`。使用前請檢查拆解結果。
5. 使用 `MORPH` 時，勾選可變形字塊並輸入逗號分隔的形式，例如 `go, goes, went`。自動拆解只涵蓋少量內建字彙，請手動補齊或修正形式。
6. 點選 **加入題庫**。若要指定學生目前作答的題目，請在該題列按 **發送給全班**；或按 **完成備課** 儲存題庫並關閉編輯器（之後可重新開啟教師備課中心再發送）。學生以點選字磚作答：`BUILD` 組句、`REDUCE` 移除字塊、`MORPH` 選擇字形。

> **教師登入提醒：**目前前端示範版固定以 `admin123` 驗證；Supabase 的 `TEACHER_PASSWORD` Secret 並未設定這項檢查。這不是安全的身分驗證，請勿將此教師介面直接公開部署至正式環境。

---

## 🔬 文法規則引擎與診斷

`src/rules/grammarRules.ts` 透過註冊表執行規則，檢查關係代名詞後的重複代名詞、依先行詞判斷主謂一致、*who / which* 選擇、`REDUCE` 題的殘留字、常見主謂一致、`a/an` 選擇及 `MORPH` 字形。概念專屬規則放在 `src/rules/validators/`，由註冊表自動載入。若規則無法給出明確診斷，則以 LCS 字詞序列對齊學生答案與正解，分類遺漏、多餘、替換或語序錯誤。這些是規則式啟發判斷，不是通用英文解析器；主謂一致判斷範圍受本地動詞表限制。

| 診斷碼類別 | 範例 | 本地診斷情境 |
| :--- | :--- | :--- |
| `M:*` | `M:VERB`、`M:AUX`、`M:DET`、`M:PREP`、`M:CONJ` | 遺漏必要字詞或連接詞。 |
| `R:*` | `R:VERB:SVA`、`R:VERB:TENSE`、`R:VERB:FORM`、`R:VERB:MOOD`、`R:RELATIVE`、`R:PREP`、`R:DET`、`R:NOUN:NUM`、`R:CONJ` | 動詞形式、關係代名詞、介系詞、限定詞、名詞單複數或連接詞有誤。 |
| `U:*` | `U:PRON`、`U:VERB`、`U:RELATIVE`、`U:CONJ` | 多出不必要的代名詞、動詞、關係代名詞或連接詞。 |
| `O:*` | `O:WRONG_ORDER`、`O:INVERSION` | 字詞順序錯誤，包含倒裝句助動詞位置不正確。 |
| `UNKNOWN_ERROR` | — | 本地規則無法判定特定錯誤，接續查詢預建診斷或 AI 兜底。 |

每筆診斷也會標記 SST 類別：`Omission`（遺漏）、`Addition`（多加）、`Misformation`（形式錯誤）或 `Misordering`（語序錯誤）。明確的本地診斷優先使用；若本地結果為 `UNKNOWN_ERROR`，學生會先立即過關，系統同時建立 `PENDING` 紀錄並在背景呼叫 `grammar-assistant` Edge Function。函式先查 `diagnosis_cache`，再視需要呼叫 Gemini，並將同一筆紀錄更新為 `SUCCESS` 或 `FAILED`；教師看板透過 Supabase Realtime 顯示批改狀態與更新結果。

教師建立通用文法題時可選擇概念與互動模式。`autoChunk(sentence, concept)` 優先保留中括號片語，再以確定性切詞及小型片語/動詞字典拆解，不呼叫 LLM。MORPH 選項以字串陣列儲存，`current_index` 表示初始選取形式，並保留 `morph_options` 舊欄位相容。新概念會路由至時間軸、情態語氣計、碎紙機或磁吸卡槽；未設定概念的舊題仍使用既有畫布。

### RuleRegistry 如何串起出題、遊戲介面與診斷

RuleRegistry 是**本地診斷規則的插件註冊點**，不是出題表單或遊戲介面的路由器：

1. **教師出題：**在 Teacher Admin 選擇文法概念與 `BUILD`、`REDUCE` 或 `MORPH`，輸入句子和答案，再用確定性 `autoChunk` 切詞（也可手動編輯字塊及變形選項）。題目會儲存所選概念與模式。`autoChunk` 不會查詢 RuleRegistry。
2. **遊戲介面：**`GrammarCanvas.vue` 依題目儲存的 `concept` 與 `ui_mode` 選擇畫布，並不查詢已註冊規則。`defaultUiModeForConcept` 提供概念預設模式，教師仍可覆寫。現行路由如下：

   | 題目設定 | 學生互動介面 |
   | :--- | :--- |
   | `MODAL_VERB` | 情態語氣壓力計 |
   | `REDUCE` | 碎紙機式刪減 |
   | `MORPH` + 時態、主謂一致、假設語氣或條件句 | 時態時間軸 |
   | `BUILD` | 磁吸式句子卡槽 |
   | 沒有概念或未符合以上組合 | 舊版畫布 |

   下方均為**介面示意圖，並非即時應用程式截圖**。學生實際看到的畫布依上表路由；字磚是點選操作，不是拖曳。

   | `BUILD` — 組合句子字塊 | `REDUCE` — 移除多餘字塊 |
   | :---: | :---: |
   | ![BUILD 組句介面示意圖](docs/images/grammar-build-ui.svg) | ![REDUCE 刪減介面示意圖](docs/images/grammar-reduce-ui.svg) |

   | `MORPH` — 選擇時態或動詞形式 | `MODAL_VERB` — 選擇情態強度 |
   | :---: | :---: |
   | ![時態 MORPH 與組句介面示意圖](docs/images/adaptive-grammar-game-ui.svg) | ![情態動詞語氣壓力計介面示意圖](docs/images/grammar-modal-ui.svg) |
3. **作答診斷：**學生送出答案後，`diagnoseGrammar` 執行通用規則，以及符合該題概念的專屬規則。`grammarRules.ts` 會 eager-load `src/rules/validators/*.ts`；每個插件以唯一 ID、驗證函式及可選的概念清單呼叫 `registerGrammarRule`。例如連接詞規則套用於子句概念、倒裝規則套用於問句／倒裝概念、情態動詞形式規則套用於 `MODAL_VERB`。明確的本地診斷訊號會沿用既有迷思回饋與紀錄流程；若規則未能診斷，則以字詞對齊分類差異，`UNKNOWN_ERROR` 可再進入非同步 AI 兜底。

因此，新增 validator 只會擴充本地診斷，不會自動新增教師表單選項或視覺互動；如需新概念或新畫布，還需視需求更新型別／概念選項及介面路由。新增規則時，將檔案放在 `src/rules/validators/` 並註冊唯一 ID。

### 現有 UI 足以涵蓋 `Grammar_Scope.md` 嗎？

教師出題表單已提供範圍內列出的所有文法概念，但這**不代表每種文法差異都有完整的遊戲建模或診斷能力**。目前對照如下：

| 文法範圍 | 現有互動 | 覆蓋情況與限制 |
| :--- | :--- | :--- |
| 句子單位、S/V/O/C、五大句型 | `BUILD` | 可組合指定正解，但不會標示文法角色，也沒有各句型專屬題目機制。 |
| 主謂一致、時態與狀態 | `MORPH` 或 `BUILD` | 可設定字形選項並依正解判斷；自動產生形式的字彙有限，時間軸也未完整建模所有時態／狀態組合。 |
| 問句與倒裝 | `BUILD` | 可組合問句／倒裝句；本地倒裝診斷是啟發式規則，並非通用問句解析器。 |
| 連接詞、名詞／形容詞／副詞子句 | `BUILD`／`REDUCE` | 可組合或刪減教師設定的字塊，但切詞依賴小型片語字典，尚未明確表示子句邊界或角色。 |
| 假設語氣與條件句 | `MORPH`／`BUILD` | 可練習教師提供的形式與語序，但沒有專門呈現兩個子句關係的條件句互動；本地語氣診斷僅涵蓋少數形式。 |
| 情態動詞（目前範圍文件之外的額外概念） | 情態強度計加 `BUILD` | 強度軸僅為粗略提示，無法涵蓋情態動詞依語境而變的所有語意；本地檢查主要針對情態動詞後接原形。 |

**建議：**若要開始練習這些範圍，不需要立刻新增頂層遊戲題型；`BUILD`、`REDUCE`、`MORPH` 已涵蓋組合、移除與變形三種基本操作。但目前也不足以宣稱已完整支援 K–12 文法。建議先在既有模式補強 S/V/O/C 與子句結構鷹架、豐富時態／狀態選項、增加雙子句條件句提示，並擴充診斷規則。只有當某概念無法用字塊組合、刪減或形式選擇表達時，才需要新增獨立遊戲題型。

### 實作與部署進度（2026-11-03）

自適應畫布、舊題轉接器、本地切詞與規則註冊表、非同步診斷流程及教師看板 Realtime 狀態已完成並推送至 `main`。既有 20 題維持原格式；題目載入畫布時才轉接，不會改寫 `questions` 資料表。自動化驗證已通過：37 項測試、TypeScript 型別檢查、Vite production build 與 Deno Edge Function 型別檢查。Production build 目前仍有主 bundle 體積偏大的警告。

**Supabase 部署尚未完成。** 尚未套用 `supabase/migrations/20261103215800_async_diagnosis_status.sql`，也尚未部署新版 `grammar-assistant` Edge Function 或連線驗證正式 Supabase 專案。啟用雲端診斷前，請先套用遷移、部署函式並設定 Gemini 金鑰：

```bash
npx supabase db push
npx supabase functions deploy grammar-assistant
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

此遷移會在 `learning_logs` 新增 `status`、`diagnosis` 欄位，並啟用該資料表的 Realtime 更新。Gemini 金鑰只設定在 Supabase Edge Function Secrets，不要放入 `.env.local` 或前端程式碼。遷移與函式部署完成前，AI 錯誤矩陣及背景診斷尚不可用；確定性切詞與本地診斷仍可使用。

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
3. 套用資料庫遷移並部署 Edge Functions：
   ```bash
   npx supabase db push
   npx supabase functions deploy deepgram-tts
   npx supabase functions deploy edge-stt
   npx supabase functions deploy teacher-action
   npx supabase functions deploy grammar-assistant
   ```
4. 設定 Secrets（API 金鑰與教師密碼）：
   ```bash
   npx supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
   npx supabase secrets set TEACHER_PASSWORD=your_teacher_password
   npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
   ```

### 開發與測試
```bash
npm install
npm run dev
npm test
```