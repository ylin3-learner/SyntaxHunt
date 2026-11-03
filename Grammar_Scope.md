`### 📄 `Grammar_Scope.md` (請儲存至專案目錄)`

# K-12 英文文法範圍與系統實作對照表

本文件依據國高中英文文法總複習講義整理，作為系統擴充至 K-12 通用文法診斷的依據。

## 🎯 系統 UI 模式定義
- **`MORPH` (字形變形)**：點擊字塊切換時態、單複數、動名詞。
- **`BUILD` (組句/排序)**：拖曳字塊排列成正確句子（含縫隙插入）。
- **`REDUCE` (減法/替換)**：將多餘字塊丟入垃圾桶，或合併字塊（如關代簡化）。

---

## 📚 一、 基礎句型與詞性 (Foundation)

### 1. 構成句子單位與五大句型
- **觀念**：單字(點) -> 片語(線) -> 句子(面)。
- **四大要素**：主詞(S)、動詞(V)、受詞(O)、補語(C)。
- **五大句型**：
  1. S + V (主+動)
  2. S + V + O (主+動+受)
  3. S + V + C (主+動+補)
  4. S + V + O1 + O2 (主+動+受1+受2)
  5. S + V + O + OC (主+動+受+補)
- **系統實作**：`BUILD` 模式。給定散落的 S, V, O, C 字塊，讓學生排出正確順序。
- **潛在錯誤**：`O:WRONG_ORDER` (語序錯誤)、`M:VERB` (漏動詞)。

### 2. 人稱、單複數與一致性 (Subject-Verb Agreement)
- **觀念**：第三人稱單數動詞加 s/es；Be 動詞變化 (am/are/is, was/were)。
- **系統實作**：`MORPH` 模式。點擊動詞切換 `go / goes`。
- **潛在錯誤**：`R:VERB:SVA` (主謂不一致)。

### 3. 英文問句 (6W1H & Yes/No)
- **觀念**：Wh- 開頭，或 Be 動詞/助動詞開頭。
- **系統實作**：`BUILD` 模式。給定直述句，讓學生拖曳助動詞與主詞對調。
- **潛在錯誤**：`O:INVERSION` (倒裝/疑問句語序錯誤)、`M:AUX` (漏助動詞)。

---

## ⏳ 二、 時態與狀態 (Tenses & Aspects)

### 1. 三大時態與四大狀態
- **時態**：現在 (Present)、過去 (Past)、未來 (Future)。
- **狀態**：簡單 (Simple)、進行 (Continuous)、完成 (Perfect)、完成進行 (Perfect Continuous)。
- **重點變化**：
  - 規則動詞 +ed / 不規則變化 (go -> went)。
  - 現在進行式 (be + V-ing)。
  - 現在完成式 (have/has + p.p.)。
- **系統實作**：`MORPH` 模式。提供下拉選單：`[eat, ate, eaten, eating]`。或 `BUILD` 模式，讓學生拖曳 `have` + `eaten` 組合。
- **潛在錯誤**：`R:VERB:TENSE` (時態錯誤)、`R:VERB:FORM` (動詞形式錯誤)。

---

## 🧩 三、 子句與連接詞 (Clauses & Connectors)

### 1. 子句概念與連接詞
- **主要子句 vs. 附屬子句**：附屬子句不能單獨存在。
- **對等連接詞 (FANBOYS)**：For, And, Nor, But, Or, Yet, So。
- **從屬連接詞**：because, although, when, if 等。
- **系統實作**：`BUILD` 模式。將兩個獨立句子用正確的連接詞連接起來。
- **潛在錯誤**：`R:CONJ` (連接詞用錯)、`U:CONJ` (多餘連接詞)。

### 2. 三大子句 (名詞、形容詞、副詞子句)
- **名詞子句**：當主詞或受詞 (that, wh-, if)。
- **形容詞子句 (關係子句)**：修飾名詞 (who, which, that)。**（原專案核心）**
- **副詞子句**：修飾動詞或整句 (because, when, if)。
- **系統實作**：
  - 形容詞子句可使用 `REDUCE` 模式（關代簡化）。
  - 名詞/副詞子句可使用 `BUILD` 模式。
- **潛在錯誤**：`U:PRON` (關係子句多餘代名詞)、`M:CONJ` (漏連接詞)。

---

## 👹 四、 進階與特殊句型 (Advanced)

### 1. 倒裝句 (Inversion)
- **觀念**：否定副詞置首 (Not only, Never)，或地方副詞置首 (Here comes the bus)。
- **系統實作**：`BUILD` 模式。將倒裝句還原成正常語序，或將正常語序拖曳成倒裝句。
- **潛在錯誤**：`O:INVERSION` (未倒裝或倒裝錯誤)。

### 2. 假設語氣 (Subjunctive Mood / Conditionals)
- **觀念**：
  - 與現在事實相反：If + S + were/V-ed, S + would/could + V。
  - 與過去事實相反：If + S + had + p.p., S + would have + p.p.。
- **系統實作**：`MORPH` 模式（點擊 `is` 變成 `were`）或 `BUILD` 模式。
- **潛在錯誤**：`R:VERB:MOOD` (語氣錯誤)。