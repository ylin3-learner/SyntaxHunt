# 🕵️ SyntaxHunt (文法出題診斷系統)

**[English](README.md) | [繁體中文](README.zh-TW.md)**

一套以「認知歷程管線」為核心、專為 K-12 設計的互動式英語文法學習工具。

本專案以 **Vue 3、TypeScript、Vite 與 Supabase** 打造，SyntaxHunt 不僅僅是一個文法測驗 App，它是一個**「以第二語言習得（SLA）理論為核心的診斷與干預引擎」**，將 SLA 理論直接轉譯為軟體架構。

有別於傳統的選擇題測驗，本系統直擊學習者的錯誤根源：**母語干擾**（中文的前位修飾 vs. 英文的後位修飾）、**結構性迷思**（例如 `who he` 的重複代名詞），以及**片語塊重組（Phrase Chunking）**。

系統中的每一個互動設計，都具備明確的教學理論基礎：
- **聚焦形式（Focus on Form, Long）**：專屬的 UI 模式（`BUILD` 磁吸組句、`REDUCE` 碎紙機、`MORPH` 膠囊變形）強迫學習者操作句型結構，將注意力精準引導至特定的文法特徵上。
- **輸入加工與認知負荷（VanPatten）**：在 `REDUCE` 模式中，獨創的「減法垃圾桶」機制嚴格隔離了目標考點，移除不必要的視覺干擾，避免學習者產生認知超載。
- **降低情感過濾（Krashen）**：系統實作了「三階段漸進式鷹架」，等待學生主動點擊「確認」後才給予溫和提示，而非立刻跳出紅色錯誤畫面，大幅降低學習焦慮。
- **注意假說（Schmidt）**：透過 **5 層責任鏈（Chain of Responsibility）** 診斷管線提供即時回饋。系統優先使用本地規則與 `compromise.js` 達到零延遲響應，自架 LanguageTool 僅作為優雅降級的備援，進行深層語意檢查。

在教師端，系統導入了 **智慧出題與人機協作（HITL, Human-in-the-Loop）**。結合啟發式策略與 NLP，系統能自動推論考點、生成診斷規則草稿，並讓老師一鍵審核採用——在不增加老師程式碼負擔的前提下，賦予老師極大的教學掌控權。

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

    subgraph ClassroomMgmt ["🎓 班級經營"]
        ClassMode["🔒 上課模式<br>鎖定學生進度"]
        Presence["📊 進度監控 (Presence)<br>即時統計完成人數"]
        SelfPace["🟢 自學模式<br>允許自由前進"]
    end

    ClassMode -.-> Practice
    Presence -.-> Teacher
    SelfPace -.-> Practice
```

---

## 🏗️ 系統架構圖 (System Architecture)

本系統具備高度解耦特性，採用 **領域驅動設計 (DDD)** 與 **整潔架構 (Clean Architecture)**，透過 **Supabase** 作為中樞，將前端 Vue 3 應用、教師端、以及外部的 AI 語音服務完美串接。

```mermaid
graph TD
    subgraph Client ["Frontend (Vue 3 + TypeScript)"]
        direction TB
        AdminUI["👩‍🏫 教師備課中心<br>(TeacherAdmin.vue)"]
        StudentUI["👨‍🎓 學生介面<br>(App.vue)"]
        
        subgraph Components ["UI 組件"]
            Forms["表單<br>(Grammar/Standard)"]
            Stages["遊戲階段<br>(Preview/Input/Macro/Micro)"]
        end

        subgraph Composables ["核心邏輯 (Composables)"]
            QuizFlow["🎮 useQuizFlow"]
            QuestionForm["📝 useQuestionForm"]
            Auth["🔐 useAdminAuth"]
            Sync["📡 useClassroomSync"]
        end

        subgraph Domain ["領域層"]
            Builder["⚙️ QuestionBuilder"]
            Rules["📏 GrammarRules"]
        end
    end

    subgraph Supabase ["Supabase Cloud Backend"]
        AuthProvider[("Auth (JWT)")]
        DB[("PostgreSQL 含 RLS 保護")]
        Realtime[("Realtime WebSocket")]
        subgraph EdgeFunctions ["Edge Functions (Deno)"]
            Action_Proxy["teacher-action"]
            TTS_Proxy["deepgram-tts"]
            STT_Proxy["edge-stt"]
            LT_Proxy["lt-proxy"]
        end
    end

    subgraph External ["外部服務"]
        Deepgram["Deepgram API"]
        LanguageTool["自架 LanguageTool<br>(Docker)"]
    end

    BrowserTTS["瀏覽器 SpeechSynthesis"]

    %% Data Flow
    AdminUI -- "1. 登入驗證 (Email/密碼)" --> AuthProvider
    AdminUI -- "2. 發送請求 (JWT)" --> Action_Proxy
    Action_Proxy -- "3. 更新狀態" --> DB
    DB -- "4. Postgres 變更" --> Realtime
    Realtime -- "5. 同步狀態" --> Sync
    Sync -- "6. 更新 UI 與計時器" --> StudentUI
    
    StudentUI -- "原生 TTS" --> BrowserTTS
    StudentUI -- "備用 TTS" --> TTS_Proxy
    StudentUI -- "STT 請求" --> STT_Proxy
    StudentUI -- "進階文法檢查" --> LT_Proxy
    
    TTS_Proxy --> Deepgram
    STT_Proxy --> Deepgram
    LT_Proxy --> LanguageTool
```

---

## 🗺️ UI 架構與資料流（Debug 追蹤指南）

```mermaid
graph TD
    %% 根組件
    App["App.vue<br/>(Root & State Controller)"]

    %% ==========================================
    %% 教師端分支 (Teacher Flow)
    %% ==========================================
    App -->|"showAdmin = true"| AdminModal["TeacherAdmin.vue<br/>(Modal & Tabs)"]
    
    AdminModal -->|"Active Tab"| Editor["QuestionEditor.vue<br/>(Form Layout)"]
    
    Editor -->|"form.questionType"| FormType{"Type?"}
    FormType -->|"grammar"| GForm["GrammarQuestionForm.vue<br/>(Custom Rules & Canvas)"]
    FormType -->|"standard / contrast / chunk"| SForm["StandardQuestionForm.vue<br/>(Stages & Toggles)"]
    
    %% 教師端儲存流程
    GForm -.->|"saveQuestion"| Builder["QuestionBuilder.ts<br/>(Data Assembly)"]
    SForm -.->|"saveQuestion"| Builder
    Builder -.->|"CloudDatabase.saveQuestions"| DB[(Supabase)]
    Builder -.->|"emit push event"| WS[(Realtime WebSocket)]

    %% ==========================================
    %% 學生端分支 (Student Flow)
    %% ==========================================
    App -->|"currentStage"| StageRouter{"Stage Router<br/>(useQuizFlow)"}
    
    %% 根據自訂的 enabledStages 順序渲染
    StageRouter -->|"preview"| StagePreview["StagePreview.vue"]
    StageRouter -->|"input"| StageInput["StageInput.vue"]
    StageRouter -->|"macro"| StageMacro["StageMacro.vue"]
    StageRouter -->|"micro"| StageMicro["StageMicro.vue"]
    StageRouter -->|"success"| StageSuccess["StageSuccess.vue"]
    
    %% 微觀階段 (核心)
    StageMicro -->|"pass question & chunks"| CanvasRouter["GrammarCanvas.vue<br/>(Canvas Dispatcher)"]

    %% ==========================================
    %% 畫布路由分發 (Canvas Routing)
    %% ==========================================
    CanvasRouter -->|"has chunks (BUILD/REDUCE)"| Tile["TileSentenceCanvas.vue<br/>(Core Engine)"]
    CanvasRouter -->|"canvas_mode: MATRIX_GATE"| Matrix["FeatureMatrixCanvas.vue"]
    CanvasRouter -->|"canvas_mode: PRAGMATIC_HP"| HP["PragmaticHpCanvas.vue"]
    CanvasRouter -->|"canvas_mode: GRAVITY_SWITCH"| Gravity["TimelineMorphCanvas.vue"]
    CanvasRouter -->|"canvas_mode: MORPH"| MorphRouter{"Concept?"}
    
    MorphRouter -->|"MODAL_VERB"| Modal["ModalGaugeCanvas.vue"]
    MorphRouter -->|"SUBJUNCTIVE / TENSE_ASPECT"| Gravity
    MorphRouter -->|"Others"| Tile
    
    CanvasRouter -->|"Legacy BUILD"| Mag["MagneticBuildCanvas.vue"]
    CanvasRouter -->|"Legacy REDUCE"| Shred["ShredderReduceCanvas.vue"]
    
    Mag -.->|"wraps"| Tile
    Shred -.->|"wraps"| Tile

    %% ==========================================
    %% TileSentenceCanvas 內部渲染 (UI Modes)
    %% ==========================================
    Tile --> TileMode{"ui_mode"}
    
    TileMode -->|"BUILD"| ClozeCheck{"has contextCloze?"}
    ClozeCheck -->|"Yes"| ClozeUI["Cloze (Fill-in-the-blank)"]
    ClozeCheck -->|"No"| BuildUI["Full Sentence Builder"]
    
    TileMode -->|"REDUCE"| ReduceUI["Card + Trash Can"]
    TileMode -->|"MORPH"| MorphUI["Fixed Sentence + Capsules"]

    %% ==========================================
    %% 樣式設定 (可選)
    %% ==========================================
    classDef root fill:#f9f9f9,stroke:#333,stroke-width:2px;
    classDef teacher fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef student fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef core fill:#e8f5e9,stroke:#388e3c,stroke-width:3px,color:#1b5e20;
    classDef legacy fill:#eceff1,stroke:#90a4ae,stroke-width:1px,stroke-dasharray: 5 5;

    class App root;
    class AdminModal,Editor,FormType,GForm,SForm,Builder teacher;
    class StageRouter,StagePreview,StageInput,StageMacro,StageMicro,StageSuccess,CanvasRouter,Matrix,HP,Gravity,MorphRouter,Modal student;
    class Tile,ClozeUI,BuildUI,ReduceUI,MorphUI core;
    class Mag,Shred legacy;
```

**🛠️ 如何 Debug UI 問題？（追蹤檢查表）**
1. **檢查 `enabledStages`**：在 `useQuizFlow.ts` 加 `console.log`，確認老師設定的陣列順序（例如 `['micro', 'input']`）是否正確。
2. **檢查 `currentStage`**：確認 `App.vue` 是否渲染了正確的階段組件。
3. **檢查 `GrammarCanvas` 路由**：查看 `selectedCanvas` 的 computed 邏輯。這題有 `chunks` 嗎？`ui_mode` 是 `BUILD` 嗎？
4. **檢查 `TileSentenceCanvas`**：確認 `initialChunks` 是否有值。如果為空，字庫就會是空白的。

---

### 📥 學生學習紀錄匯出與攔截 (SummaryReport.vue)

為了確保學生不會在未繳交評量結果的情況下離開課堂，`SummaryReport.vue` 實作了「零信任離開攔截（Zero-Trust Leave Interception）」與「自動下載」機制。

```mermaid
stateDiagram-v2
    [*] --> Generating: 組件掛載 (onMounted)
    
    Generating --> AutoDownload: html2canvas 生成 PNG
    
    AutoDownload --> Success: 觸發 a.click() 下載
    AutoDownload --> Failed: 瀏覽器阻擋 / 發生錯誤
    
    Success --> Downloaded: isDownloaded = true
    Failed --> ManualDownload: 顯示「手動下載」按鈕
    
    ManualDownload --> Downloaded: 學生點擊手動下載
    
    state Downloaded {
        [*] --> SafeToLeave
        SafeToLeave --> [*]: 點擊結束或關閉視窗 (無警告)
    }
    
    state Generating {
        [*] --> BeforeUnloadActive
        BeforeUnloadActive --> [*]: 試圖關閉視窗 (瀏覽器彈出警告)
    }
```

**核心機制說明：**
1. **自動下載**：在 `onMounted` 階段，系統利用 `html2canvas` 抓取 `.summary-card` DOM，並自動觸發 PNG 檔案下載。
2. **離開攔截 (`beforeunload`)**：系統註冊了全域事件攔截。若學生在下載成功前（`isDownloaded === false`）試圖重新整理或關閉分頁，瀏覽器會彈出原生的「您有未保存的變更」警告。
3. **優雅降級**：若現代瀏覽器基於安全性阻擋了自動下載，UI 會降級顯示「📸 點擊領取學習紀錄」按鈕。在學生成功下載並點擊「✅ 我已保存，結束練習」之前，攔截警告都會保持啟用。

---

### 🏷️ 錯誤標籤體系與診斷代碼 (ERRANT + SST)

為了確保教學診斷的精準度，並為後續的數據分析提供堅實基礎，SyntaxHunt 並不僅僅將答案標記為「對」或「錯」。系統的診斷引擎會根據學術界通用的 **ERRANT 框架**（編輯操作）與 **SST 表面策略分類法**（認知行為），輸出精準的錯誤代碼。

#### 1. 編輯操作分類 (ERRANT)
系統會根據學生的答案與正確答案的差異，將錯誤分為四大類：
- **`M` (Missing / 遺漏)**：學生漏掉了必要的單字（例如：`M:PREP` 遺漏介系詞）。
- **`R` (Replacement / 替換與形式錯誤)**：學生使用了錯誤的形式或單字（例如：`R:VERB:TENSE` 時態錯誤，`R:VERB:SVA` 主謂不一致）。
- **`U` (Unnecessary / 多餘)**：學生輸入了多餘的字（例如：`U:PRON` 關係子句中的多餘代名詞 `who he`）。
- **`O` (Order / 語序錯誤)**：單字都對了，但順序排錯了（例如：`O:INVERSION` 倒裝句未倒裝）。

#### 2. 表面策略分類法 (SST)
每一筆診斷訊號也會同步映射到 SST 分類中，這讓老師可以在「數據分析儀表板」中，視覺化檢視全班學生的認知錯誤模式：
- **Omission (遺漏)**
- **Addition (添加)**
- **Misformation (形式錯誤)**
- **Misordering (語序錯誤)**

*錯誤代碼結構範例：`R:VERB:SVA` -> 代表「替換(R)」操作，發生在「動詞(VERB)」上，屬於「主謂一致(SVA)」錯誤。*

---

### 🧠 文法診斷引擎（責任鏈模式）

本專案的核心診斷管線已從單體規則引擎，全面重構為高內聚、低耦合的 **5 層責任鏈模式（Chain of Responsibility）**。此架構確保了「毫秒級的本地響應」，同時保證 **「絕對不會放過任何一個學生的錯誤」**。

```mermaid
flowchart TD
    Input([學生送出答案]) --> L1

    subgraph Local ["本地確定性診斷 (0ms)"]
        L1["L1: 本地文法規則<br>確定性檢查 (主謂一致、時態等)"]
        L2["L2: 老師自訂規則<br>Regex \b 邊界與精準回饋"]
        L3["L3: 結構差異比對<br>LCS 演算法 (漏詞、多詞、語序)"]
    end

    subgraph Remote ["遠端深度診斷 (異步)"]
        L4["L4: LanguageTool API<br>深層語意檢查 (含 AbortSignal 超時控制)"]
    end

    subgraph Fallback ["終極兜底"]
        L5["L5: 高亮兜底<br>找出第一個差異點並標紅"]
    end

    L1 -- "命中確定性錯誤" --> Output([顯示 UI 反饋])
    L1 -- "未知錯誤" --> L2
    L2 -- "命中自訂規則" --> Output
    L2 -- "未知錯誤" --> L3
    L3 -- "命中結構錯誤" --> Output
    L3 -- "未知錯誤" --> L4
    L4 -- "找到文法問題" --> Output
    L4 -- "超時/連線失敗" --> L5
    L5 --> Output
```

---

### 🤖 智慧出題與人機協作 (HITL)

為了在「減輕教師負擔」與「極致診斷精準度」之間取得完美平衡，系統導入了 **智慧出題管線（Smart Authoring Pipeline）**。

1. **自動推論引擎 (`autoInfer.ts`)**：
   基於完整的 20 章 K-12 文法範圍，系統使用啟發式策略自動推論潛在考點（如主謂一致、過去式、假設語氣），並一鍵生成 `wrongPattern` 與回饋訊息的草稿。
2. **智慧切詞策略 (`smartChunker.ts`)**：
   採用 **策略模式（Strategy Pattern）**，將原有的 `compromise.js` 切詞與 `autoInfer` 優雅結合。若推論引擎偵測到形態變化目標（如不規則動詞），會自動升級字塊屬性；若無特徵可循，則無縫降級回傳基礎切詞結果，保證系統穩定性。
3. **教師一鍵採用（Human-in-the-Loop）**：
   老師只需點擊「本地切詞」，系統便會自動完成切詞、推薦最佳 UI 模式，並將推論出的規則作為「🤖 系統建議」呈現。老師可快速審核微調，點擊「一鍵採用」後寫入 L2 自訂規則層。
4. **零執行期負擔**：
   `autoInfer` 與 `smartChunker` 僅在**教師備課階段**執行。學生端的診斷管線（L1-L5）完全不受影響，確保了毫秒級的本地響應與絕對的穩定性。

---

### 🎯 文法概念驅動的出題架構（不綁死課綱）

有別於傳統將題目死綁定在「課本第幾章」的學習平台，SyntaxHunt 採用了**「文法概念驅動（Concept-Driven）」**的架構。系統的 UI 路由與診斷管線，完全與課綱章節解耦。

當老師在備課中心出題時，只需選擇**「文法考點（Grammar Concept）」**（如：主謂一致、過去式），而不用管這是哪一冊第幾課。系統會自動：
1. 路由到最適合的互動畫布（如時態題自動切換為 `MORPH` 摺紙變形，關係子句題切換為 `REDUCE` 碎紙機）。
2. 載入對應的本地文法驗證器（Validators）。
3. 透過 `compromise.js` 自動推論並生成潛在的診斷規則。

> 這賦予了教師極大的自由度：老師可以從任何來源（新聞、電影台詞、歷屆試題）挑選句子，只要指定文法概念，系統就能無縫生成高品質的診斷題目，完全不受限於教材的編排順序。

### 五層防禦機制

1. **L1 本地模組化 NLP 增強規則 (`L1_LocalRules.ts`)**：
   扮演單純的調度器。優先執行舊有同步規則以達到零延遲短路，接著呼叫 **模組化 NLP 驗證器**：
   - `svaValidator.ts`：抓取主謂一致錯誤。結合 `english-verbs-irregular` 與規則推導（`-s`, `-es`, `-ies`），確保 100% 精準度。
   - `tenseValidator.ts`：支援 12 種時態。利用 `compromise.js` 提取動詞原形並分析助動詞結構（如 `will have`, `had`），精準抓出漏掉助動詞或時態用錯的錯誤。
   - `gerundInfinitiveValidator.ts`：嚴格檢查動詞搭配（如 `enjoy to go` 或 `want going`），並內建例外清單避免誤報（如 `something`, `anything`）。
   - `doubleNegativeValidator.ts`：利用精準 Token 比對，抓取 `don't never` 等雙重否定。
   - `inversionValidator.ts`：偵測否定副詞置首時（如 `Never I have`）是否遺漏倒裝。
   - `specialStructures.ts`：模組化處理連接詞、情態動詞與假設語氣。
2. **L2 老師自訂規則 (`L2_CustomRules.ts`)**：
   具備 **「智慧變體展開（Smart Variant Expansion）」** 能力。若老師輸入多字片語（如 `He go`），系統會自動利用 `compromise.js` 展開所有動詞變體（如 `He goes`, `He went`）來攔截所有錯誤；若老師只輸入單字（如 `go`），系統則嚴格執行單字邊界匹配，避免誤傷 `going` 等變體。
3. **L3 結構差異比對 (`L3_StructuralDiff.ts`)**：
   使用 **最長公共子序列（LCS）** 演算法計算 Token 級別的差異。將錯誤精準分類為遺漏（`M:`）、多餘（`U:`）、語序（`O:`）與替換（`R:`）。
4. **L4 LanguageTool 深度診斷 (`L4_LanguageTool.ts`)**：
   僅在本地層級皆回傳 `UNKNOWN_ERROR` 時觸發。使用 `AbortController` 搭配 8 秒超時控制。若網路失敗或超時，會優雅降級至 L5，絕不卡住學生畫面。
5. **L5 終極兜底高亮 (`L5_HighlightFallback.ts`)**：
   教育意義的安全網。若所有規則皆無法解釋錯誤，系統會利用 `findDiffIndices` 找出第一個錯誤的字塊（Tile）。回傳 `HIGHLIGHT_ONLY` 訊號，讓 UI 將該字塊標紅，並顯示通用提示（「這裡的單字形式或順序好像不太對喔」），確保學習閉環不會中斷。

### 💡 核心設計優勢
- **短路效率（Short-Circuit）**：99% 的常見錯誤在 L1~L3 就以零網路開銷解決。
- **教師賦能（Teacher-in-the-Loop）**：老師可透過 L2 注入高度客製化的文法回饋，無需撰寫複雜程式碼。
- **優雅降級（Graceful Degradation）**：外部 API（LanguageTool）故障或超時，絕對不會癱瘓系統，而是安全降級至 L5 兜底。
- **完整測試覆蓋**：使用 Vitest 對管線的短路邏輯、超時降級機制與正則邊界進行了 100% 的單元測試防護。

---

### 🪜 漸進式鷹架與回饋策略 (Progressive Scaffolding)

為了避免過度鷹架（Over-scaffolding）造成學習焦慮（降低情感過濾），UI 層實作了**三階段漸進式回饋機制**。系統不再於學生每次拖拉字塊時立刻報錯，而是在 BUILD 模式下等待學生主動點擊「Check Answer」。

1. **第一階段 — 溫和提示 (Soft Warning)**：  
   學生第一次排錯時，系統僅顯示黃色的溫和提示（「好像還差一點點，檢查看看順序或單字有沒有拼對！」）。**不會有紅色震動、不播放錯誤音效，且不會觸發 Pipeline（L1-L5）與外部 API。**
2. **第二階段 — 具體診斷 (Specific Diagnosis)**：  
   若學生再次嘗試仍錯誤，系統才會執行完整的診斷管線（L1 到 L4）。UI 會顯示具體的文法錯誤提示（如「少了 in」），並伴隨紅色標示與震動，引導學生修正。
3. **第三階段 — 高亮兜底 (L5 Highlight Fallback)**：  
   若學生嘗試多次仍無法排對，系統啟動最終兜底機制，將錯誤的字塊直接標紅，確保學生不會卡關，並能在挫折中獲得明確的視覺引導。

---

### 題目路由資料流 (Student Question Routing)

這張圖展示了系統如何根據「班級模式」，決定將哪些題目渲染給學生。

```mermaid
flowchart TD
    subgraph Data ["☁️ 雲端題庫"]
        QB[Question Bank<br>已依單元分類]
    end

    subgraph App ["📱 學生端 (App.vue)"]
        Start((進入頁面)) --> Load[依老師 ID 載入題庫]
        Load --> ModeCheck{當前模式?}
        
        ModeCheck -->|自學模式| LockCheck{老師是否鎖定單元?}
        LockCheck -->|否| ShowSelector[顯示單元下拉選單]
        ShowSelector --> UserSelect[學生點選單元]
        UserSelect --> Filter1[過濾出該單元題目]
        
        LockCheck -->|是| ForceFilter[強制切換至鎖定單元<br>隱藏選單]
        
        ModeCheck -->|上課模式| LockUI[隱藏下拉選單<br>鎖定畫面]
        LockUI --> TeacherPush[接收老師廣播]
        TeacherPush --> AutoSwitch[自動切換至該題所屬單元]
        
        Filter1 --> Render[渲染當前題目]
        ForceFilter --> Render
        AutoSwitch --> Render
    end
    
    QB -. "Fetch" .-> Load
    Render --> End((開始作答))
```

---

## 🎨 核心 UI 模式（教學畫布設計）

為了對應不同文法章節的認知負荷與考點，系統設計了 6 種專屬的 UI 模式。學生端會根據題目的 `grammarTopicId` 或 `concept` 自動選擇最適合的互動畫布，避免單一介面造成學習干擾。

| 核心 UI 模式 | 處理哪些章節（考點） | 為什麼適用？ | 淘汰/合併舊模式 |
| :--- | :--- | :--- | :--- |
| **1. `BUILD` (磁吸插槽)** | 第1章(五大句型)、第17章(連接詞)、第18章(名詞子句)、第19章(句型)、第15章(倒裝句)、第16章(關係子句-組裝) | 處理**語序與結構**。只要是把字塊排成正確順序，全用 `BUILD`。 | 舊版 `MacroDragCanvas` 收編於此。 |
| **2. `MORPH` (摺紙變形)** | 第2章(時態)、第9章(比較級)、第10章(動名詞)、第12章(被動語態) | 處理**單字型態變化**。點擊字塊切換形式，句子其他部分固定。 | 舊版 `MorphChoiceCanvas`、`TimelineMorphCanvas` 整合為一。 |
| **3. `REDUCE` (碎紙機)** | 第7章(分詞構句)、第16章(關係子句-簡化)、第18章(代名詞替換) | 處理**刪減與合併**。把多餘的字丟掉，或把兩個字合併。 | 舊版 `ShredderReduceCanvas`。 |
| **4. `MATRIX_GATE` (特徵解鎖)** | 第13章(特殊動詞 spend/cost)、第14章(感官/使役動詞) | 處理**易混淆字詞的句法限制**。學生必須先選對特徵開關，才能解鎖字卡。 | 新增模式，完全取代舊版盲猜字卡的 `BUILD` 題。 |
| **5. `PRAGMATIC_HP` (語情血條)** | 第4章(助動詞/情態)、第11章(情緒動詞) | 處理**語氣與社交距離**。VADER 分析冒犯度，扣血或補血。 | 新增模式。 |
| **6. `GRAVITY_SWITCH` (重力開關)** | 第20章(假設語氣/條件句) | 處理**非現實語境**。切換開關，句子漂浮，時態退後一步。 | 新增模式。 |

---

## 🔒 多租戶與安全性 (教師資料隔離)

本系統嚴格實作多租戶架構，確保每位教師只能看到並修改自己的題庫與班級狀態。

- **Supabase Auth**：教師透過 Email 與密碼登入 (`signInWithPassword`)。
- **資料庫 Schema**：`questions`、`learning_logs`、`classroom_state` 皆包含 `teacher_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()` 欄位。
- **資料列級別安全 (RLS)**：
  - **教師**：只能對 `auth.uid() = teacher_id` 的資料進行 `SELECT`、`INSERT`、`UPDATE`、`DELETE`。
  - **學生**：**不會**直接存取 `questions` 表。學生端題庫來自 `localStorage` 或預設題目，並透過 `room_code` 加入老師的 Realtime 頻道。
- **座號 (Seat Codes)**：學生隨機分配 `S01`–`S30` 的座號並存入 `sessionStorage`，透過 `trackPresence(seatCode)` 傳送給老師端顯示。
- **頻道隔離**：Realtime 頻道嚴格命名為 `classroom_sync_${teacherId}`，防止跨租戶資料外洩。

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
    T->>EF: 開啟上課模式 (附帶 JWT)
    EF->>RT: 更新 classroom_state (is_class_mode = true)
    RT-->>S: 收到同步狀態 (isClassMode = true)
    RT-->>S2: 收到同步狀態 (isClassMode = true)

    Note over S,RT: 情境二：學生作答與 Presence 進度追蹤
    S->>S: 完成題目 (handleSuccess)
    S->>RT: track({ status: 'completed', seatCode: 'S01' })
    RT-->>T: 觸發 Presence Sync (更新完成人數: 1)
    
    Note over S,T: 情境三：上課模式鎖定
    S->>S: 點擊「下一關」
    S-->>S: 按鈕 Disabled (等待老師發送)
    
    T->>EF: 點擊「🚀 發送」下一題
    EF->>RT: 更新題目 ID
    RT-->>S: 題目切換，狀態改回 answering
    RT-->>S2: 題目切換，狀態改回 answering
```

---

## 🛡️ 資料一致性與容錯機制 (即時廣播)

為了確保真實課堂環境中的流暢體驗，系統的即時廣播機制具備了處理「競態條件（Race Condition）」與「網路不同步」的容錯能力：
1. **零信任廣播（教師端）**：系統嚴格等待資料庫確認寫入成功（`await CloudDatabase.saveQuestions`）後，才會發出廣播。同時會攔截未登入狀態，避免「假成功」導致的空包彈。
2. **防禦性載入（學生端）**：當學生收到推播的 `question_id` 時，若在本地記憶體中找不到（例如剛建好的新題），系統會自動觸發 **「防禦性拉取（Defensive Fetch）」**，即時從雲端更新題庫後再切換畫面。
3. **優雅降級**：若連線徹底失敗，學生端的本地進度與當前作答畫面完全不受影響，確保課堂節奏不會因網路波動而中斷。

---

## ✨ 主要功能

### 給學生
- **句子化減法 UI（Reduce 模式）**：學生看到的是完整的句子，只需點擊有底線的多餘字詞，即可將其丟入下方的垃圾桶。介面移除了所有拖曳與排序操作，讓認知焦點完全集中在「刪除多餘成分」。
- **膠囊變形（Morph 模式）**：句子順序完全固定，遇到可變形的紫色字詞時，點擊該字詞（膠囊）會在正下方展開下拉選單供選擇。大幅降低視覺干擾與認知負荷。
- **標準題與轉換題 (Standard & Reduce)**：包含聽力輸入、聚焦形式（使用獨創的**句子化減法垃圾桶**機制）、語音輸出與意識提升。UI 嚴格隔離教學目標，避免不必要的操作干擾。
- **上課模式鎖定 (Class Mode Lock)**：當老師開啟上課模式時，「下一關」按鈕會被禁用。
- **片語塊視覺化**：多字片語顯示為不可分割的藍色磚塊。
- **無標籤空間拼圖**：巨觀拖拉階段只顯示圖片，不顯示文字，避免洩題。
- **文字比對發音面板**：透過 Deepgram 辨識發音，精準畫線標示漏讀單字。
- **單元選擇器與遠端鎖定**：在自由進度模式下，學生可透過下拉選單切換單元。但若老師發布了「鎖定單元」，選單會自動隱藏並替換為鎖定提示，強制學生專注於當前單元。

### 給老師（Teacher Admin）
- **進度監控面板 (Presence Dashboard)**：輸入目標人數，系統會即時統計「已完成人數」，並顯示高亮進度條。
- **上課模式開關 (Class Mode Toggle)**：一鍵鎖定全班進度，禁止學生偷跑。
- **漏斗式出題（Funnel Authoring）**：用 `[ ]` 框出要保留的片語，系統自動視覺化「保留」與「丟棄」的字。
- **語意控制 (Person vs. Thing)**：明確指定先行詞是「人」或「物」，確保本地規則引擎能精準判斷 `who` 與 `which`。
- **視覺化題目流程與單元資料夾**：開啟全螢幕節點畫布，以連線檢視及調整題目順序。
- **主從遠端控制**：老師可一鍵推送題目、強制重置計時器，或隨時點擊 `+30s` 為全班加時。
- **單元級別鎖定 (Unit Locking)**：老師可在班級控制面板選擇特定單元並發布，強制學生端只能看到該單元的題目，隱藏切換選單，防止學生偷跑或分心。
- **一鍵掃碼加入 (QR Code)**：老師可在班級控制面板點擊生成全螢幕 QR Code，學生用手機或平板掃描即可自動帶入 `?room=XXXX` 參數並加入專屬班級頻道，省去手動輸入代碼的麻煩。

### 如何使用通用文法題

1. 開啟 **教師備課中心**，在題目編輯器選擇 **通用文法題**。
2. 先選課綱章節，再選具體文法考點。
3. 輸入來源句與精確的正確答案。
4. 點選 **本地切詞**，或手動拆解句子。
5. 使用 `MORPH` 考點時，只勾選一個可變形目標字塊，並輸入逗號分隔的形式。
6. 點選 **加入題庫**。若要指定學生目前作答的題目，請在該題列按 **發送給全班**。

> **教師登入提醒：**教師登入已全面改為 Supabase Auth（`signInWithPassword`，Email + 密碼）。現在您可以直接在登入彈窗中點擊「**點此註冊**」來建立新的教師帳號，或者到 Supabase 後台手動新增。

---

## 🛠️ 技術棧與工程

- **前端**：Vue 3（Composition API）+ Vite + TypeScript
- **狀態管理**：Vue Composables (`useQuizFlow`, `useQuestionForm`, `useClassroomSync`)
- **本地 NLP**：compromise.js + `english-verbs-irregular`
- **診斷引擎**：Local Rule Registry + LCS algorithm + LanguageTool (Deep Semantic Check)
- **後端與資料庫**：Supabase（PostgreSQL、Edge Functions、Realtime Presence、Auth、RLS）
- **基礎設施**：Render (Docker / LanguageTool) + GitHub Actions (Keep-Alive)
- **語音 (TTS & STT)**：可用的原生 `SpeechSynthesis` 語音；Deepgram TTS／STT 透過 Edge Functions 呼叫
- **QR Code 產生**：`qrcode.vue`

---

## 📋 進度追蹤 (Progress Tracking)

### 🏗️ 責任鏈模式重構 (Chain of Responsibility Refactoring)

**狀態**: ✅ 架構完成，測試全部通過

本專案已將文法診斷管線從單體 `diagnoseGrammar()` 重構為**責任鏈模式 (Chain of Responsibility)**，達成高內聚、低耦合的架構目標。

#### 📁 目錄結構 (Diagnostics & Validators)
```text
src/rules/
├── diagnostics/
│   ├── pipeline.ts                  # Pipeline Manager
│   ├── layers/
│   │   ├── L1_LocalRules.ts         # Layer 1: Dispatcher (Integrates Validators)
│   │   ├── L2_CustomRules.ts        # Layer 2: Custom Rules (Smart Variant Expansion)
│   │   ├── L3_StructuralDiff.ts     # Layer 3: LCS Structural Diff
│   │   ├── L4_LanguageTool.ts       # Layer 4: Remote LanguageTool API
│   │   └── L5_HighlightFallback.ts  # Layer 5: Ultimate Highlight Fallback
└── validators/                      # Modular Grammar Validators
    ├── svaValidator.ts              # Subject-Verb Agreement (NLP + Irregular verbs)
    ├── tenseValidator.ts            # 12-Tense Check (NLP auxiliary extraction)
    ├── gerundInfinitiveValidator.ts # Gerund vs. Infinitive (Dictionary + Exceptions)
    ├── doubleNegativeValidator.ts   # Double Negative (Regex)
    ├── inversionValidator.ts        # Inversion (Auxiliary placement)
    └── specialStructures.ts         # Conjunctions, Modals, Subjunctive
```

#### 🧪 測試狀態
- ✅ `src/rules/diagnostics/pipeline.test.ts`
- ✅ `src/rules/diagnostics/layers/L1_LocalRules.test.ts`
- ✅ `src/rules/diagnostics/layers/L2_CustomRules.test.ts`
- ✅ `src/rules/diagnostics/layers/L3_StructuralDiff.test.ts`

---

## 🚀 快速開始

### 環境設定
建立 `.env.local` 檔案：
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase 設定
1. 建立基礎資料表 (`questions`, `learning_logs`, `classroom_state`)。
2. 套用最新的多租戶與 RLS 遷移腳本：
   ```bash
   npx supabase db push
   ```
3. 部署 Edge Functions：
   ```bash
   npx supabase functions deploy deepgram-tts
   npx supabase functions deploy edge-stt
   npx supabase functions deploy teacher-action
   npx supabase functions deploy lt-proxy
   ```
4. 到 **Supabase Dashboard -> Authentication -> Users** 建立一組教師帳號。

### 開發與測試
```bash
npm install
npm run dev
npm test
```