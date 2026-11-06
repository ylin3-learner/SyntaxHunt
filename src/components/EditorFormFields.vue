<script setup lang="ts">
import type { CanvasMode, Chunk } from '../rules/types';

defineProps<{
  canvasMode: CanvasMode;
  grammarSentence: string;
  grammarAnswer: string;
  targetNoun: string;
  antecedentNumber: 'singular' | 'plural';
  grammarChunks: Chunk[];
  statusGap: number;
  npcLabel: string;
  matrixXInput: string;
  matrixYInput: string;
  matrixCorrectX: number;
  matrixCorrectY: number;
  matrixPrompt: string;
  matrixAnswer: string;
  matrixOptionsInput: string;
}>();

const emit = defineEmits<{
  (e: 'update:canvasMode', value: CanvasMode): void;
  (e: 'update:grammarSentence', value: string): void;
  (e: 'update:grammarAnswer', value: string): void;
  (e: 'update:targetNoun', value: string): void;
  (e: 'update:antecedentNumber', value: 'singular' | 'plural'): void;
  (e: 'update:statusGap', value: number): void;
  (e: 'update:npcLabel', value: string): void;
  (e: 'update:matrixXInput', value: string): void;
  (e: 'update:matrixYInput', value: string): void;
  (e: 'update:matrixCorrectX', value: number): void;
  (e: 'update:matrixCorrectY', value: number): void;
  (e: 'update:matrixPrompt', value: string): void;
  (e: 'update:matrixAnswer', value: string): void;
  (e: 'update:matrixOptionsInput', value: string): void;
  (e: 'auto-chunk'): void;
  (e: 'split-manually'): void;
  (e: 'update-chunk-text', id: string, value: string): void;
  (e: 'toggle-morph-target', id: string, enabled: boolean): void;
  (e: 'update-morph-options', id: string, value: string): void;
  (e: 'mode-change'): void;
}>();

const canvasModes: Array<{ value: CanvasMode; label: string }> = [
  { value: 'BUILD', label: 'BUILD 磁吸插槽' },
  { value: 'MORPH', label: 'MORPH 摺紙變形' },
  { value: 'REDUCE', label: 'REDUCE 碎紙機' },
  { value: 'MATRIX_GATE', label: 'MATRIX_GATE 特徵解鎖' },
  { value: 'PRAGMATIC_HP', label: 'PRAGMATIC_HP 語情血條' },
  { value: 'GRAVITY_SWITCH', label: 'GRAVITY_SWITCH 重力切換' },
];

const updateMode = (event: Event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  emit('update:canvasMode', select.value as CanvasMode);
  emit('mode-change');
};

const updateCheckbox = (id: string, event: Event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement) emit('toggle-morph-target', id, input.checked);
};
</script>

<template>
  <section class="editor-mode-fields">
    <div class="form-group">
      <label for="grammar-interaction">畫布模式（依考點推薦，可手動覆寫）</label>
      <select id="grammar-interaction" :value="canvasMode" class="grammar-select" @change="updateMode">
        <option v-for="mode in canvasModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
      </select>
    </div>

    <div v-if="canvasMode === 'PRAGMATIC_HP'" class="grammar-recommendation">
      <strong>語情小人血條</strong>
      <p>學生從字卡組句並送出；強硬語氣扣除關係值，委婉語氣補血。</p>
      <label for="status-gap">身分地位差距（0–5）</label>
      <input id="status-gap" type="number" min="0" max="5" step="1" :value="statusGap"
        @input="emit('update:statusGap', Number(($event.target as HTMLInputElement).value))" />
      <label for="npc-label">NPC 身分（選填）</label>
      <input id="npc-label" type="text" placeholder="例如：總經理、店員" :value="npcLabel"
        @input="emit('update:npcLabel', ($event.target as HTMLInputElement).value)" />
    </div>

    <div v-if="canvasMode === 'MATRIX_GATE'" class="grammar-recommendation">
      <strong>特徵解鎖矩陣</strong>
      <p>學生必須先解碼兩個句法特徵，才能選擇正確的目標動詞。</p>
      <label for="matrix-axis-x">X 軸兩個選項（以逗號分隔）</label>
      <input id="matrix-axis-x" type="text" :value="matrixXInput"
        @input="emit('update:matrixXInput', ($event.target as HTMLInputElement).value)" />
      <select :value="matrixCorrectX" class="grammar-select" aria-label="特徵 X 正確選項"
        @change="emit('update:matrixCorrectX', Number(($event.target as HTMLSelectElement).value))">
        <option :value="0">X 軸第一個選項為正確答案</option>
        <option :value="1">X 軸第二個選項為正確答案</option>
      </select>
      <label for="matrix-axis-y">Y 軸兩個選項（以逗號分隔）</label>
      <input id="matrix-axis-y" type="text" :value="matrixYInput"
        @input="emit('update:matrixYInput', ($event.target as HTMLInputElement).value)" />
      <select :value="matrixCorrectY" class="grammar-select" aria-label="特徵 Y 正確選項"
        @change="emit('update:matrixCorrectY', Number(($event.target as HTMLSelectElement).value))">
        <option :value="0">Y 軸第一個選項為正確答案</option>
        <option :value="1">Y 軸第二個選項為正確答案</option>
      </select>
      <label for="matrix-prompt">顯示給學生的題目句（以底線標示空格）</label>
      <input id="matrix-prompt" type="text" placeholder="The ticket _______ me 100 dollars to buy."
        :value="matrixPrompt" @input="emit('update:matrixPrompt', ($event.target as HTMLInputElement).value)" />
      <label for="matrix-answer">正確目標動詞</label>
      <input id="matrix-answer" type="text" placeholder="cost" :value="matrixAnswer"
        @input="emit('update:matrixAnswer', ($event.target as HTMLInputElement).value)" />
      <label for="matrix-options">目標動詞選項（以逗號分隔）</label>
      <input id="matrix-options" type="text" placeholder="spend, cost, take, pay" :value="matrixOptionsInput"
        @input="emit('update:matrixOptionsInput', ($event.target as HTMLInputElement).value)" />
    </div>

    <div class="form-group">
      <label for="grammar-sentence">{{ canvasMode === 'REDUCE' ? '原始完整句子（字塊起始內容）' : '英文句子（字塊來源）' }}</label>
      <input id="grammar-sentence" :value="grammarSentence" type="text" placeholder="例如：The boy went to school yesterday."
        @input="emit('update:grammarSentence', ($event.target as HTMLInputElement).value)" />
    </div>
    <div class="form-group">
      <label for="grammar-answer">學生完成時的正確答案</label>
      <input id="grammar-answer" :value="grammarAnswer" type="text"
        :placeholder="canvasMode === 'REDUCE' ? '例如：The boy to school yesterday.' : '留空則與英文句子相同'"
        @input="emit('update:grammarAnswer', ($event.target as HTMLInputElement).value)" />
    </div>

    <template v-if="['BUILD', 'MORPH', 'REDUCE', 'GRAVITY_SWITCH'].includes(canvasMode)">
      <div class="form-group">
        <label>目標名詞與單複數（供診斷規則使用）</label>
        <div class="form-row">
          <input :value="targetNoun" type="text" placeholder="例如：The boy"
            @input="emit('update:targetNoun', ($event.target as HTMLInputElement).value)" />
          <select :value="antecedentNumber" class="grammar-select"
            @change="emit('update:antecedentNumber', ($event.target as HTMLSelectElement).value as 'singular' | 'plural')">
            <option value="singular">單數</option>
            <option value="plural">複數</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <button id="auto-chunk" type="button" class="btn-save" @click="emit('auto-chunk')">⚡ 本地切詞</button>
        <button id="split-manually" type="button" class="btn-push" style="margin-top: 10px;" @click="emit('split-manually')">
          以空白拆解（手動設定變形）
        </button>
      </div>
      <div v-if="grammarChunks.length" class="form-group">
        <label>切詞預覽</label>
        <div class="grammar-chunk-preview" aria-label="切詞預覽">
          <span v-for="chunk in grammarChunks" :key="`preview-${chunk.id}`" class="grammar-chunk-chip"
            :class="{ 'morph-chip': chunk.can_morph }">
            {{ chunk.text }}
          </span>
        </div>
      </div>
      <div v-if="grammarChunks.length" class="form-group">
        <label>字塊檢視（可編輯；勾選字塊可設定 MORPH 選項）</label>
        <div v-for="chunk in grammarChunks" :key="chunk.id" class="grammar-chunk-row">
          <input :value="chunk.text" type="text" aria-label="字塊文字"
            @input="emit('update-chunk-text', chunk.id, ($event.target as HTMLInputElement).value)" />
          <label><input :checked="chunk.can_morph" type="checkbox"
              @change="updateCheckbox(chunk.id, $event)" /> 可變形</label>
          <input v-if="chunk.can_morph" :value="(chunk.options ?? chunk.morph_options)?.join(', ')" type="text"
            placeholder="go, goes, went" aria-label="變形選項"
            @input="emit('update-morph-options', chunk.id, ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.editor-mode-fields { display: flex; flex-direction: column; }
.form-group, .grammar-recommendation { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.form-group label, .grammar-recommendation strong { color: #475569; font-weight: 700; }
.grammar-select, .grammar-recommendation input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
.grammar-recommendation { padding: 14px 16px; border: 1px solid #bae6fd; border-radius: 12px; background: #f0f9ff; color: #0c4a6e; }
.grammar-recommendation p { margin: 0; color: #334155; }
.form-row { display: flex; gap: 12px; }
.form-row > * { min-width: 0; flex: 1; }
.grammar-chunk-preview, .grammar-chunk-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.grammar-chunk-chip { padding: 6px 10px; border-radius: 8px; background: #f1f5f9; color: #334155; }
.grammar-chunk-chip.morph-chip { background: #ede9fe; color: #5b21b6; }
.grammar-chunk-row > input:first-child { min-width: 120px; flex: 1; }
.grammar-chunk-row label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.grammar-chunk-row input[aria-label="變形選項"] { flex: 1; }
</style>
