<script setup lang="ts">
import type { QuestionData } from '../rules/types';

type QuestionFilter = 'all' | 'unclassified' | `unit:${string}`;

defineProps<{
  questions: QuestionData[];
  filteredQuestions: QuestionData[];
  availableUnits: string[];
  editingId: string | null;
  unitFilter: QuestionFilter;
  isClassPanelExpanded: boolean;
  isQuestionsExpanded: boolean;
  isClassModeToggle: boolean;
  targetCountInput: number;
  roomCode?: string;
  activeUnitInput?: string; 
}>();

const emit = defineEmits<{
  (e: 'update:unitFilter', value: QuestionFilter): void;
  (e: 'update:isClassPanelExpanded', value: boolean): void;
  (e: 'update:isQuestionsExpanded', value: boolean): void;
  (e: 'update:isClassModeToggle', value: boolean): void;
  (e: 'update:targetCountInput', value: number): void;
  (e: 'open-flow'): void;
  (e: 'mode-change'): void;
  (e: 'reset-progress'): void;
  (e: 'edit', question: QuestionData): void;
  (e: 'push', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'new-question'): void;
  (e: 'save-close'): void;
  (e: 'show-qr'): void;
  (e: 'update:activeUnitInput', value: string): void; // 👈 新增
  (e: 'lock-unit'): void; // 👈 新增
}>();

const isChecked = (event: Event) =>
  (event.target as HTMLInputElement).checked;
const numberValue = (event: Event) =>
  Number((event.target as HTMLInputElement).value);
</script>

<template>
  <aside class="question-list-sidebar sidebar">
    <div class="sidebar-header">
      <h2>📚 課前備課中心</h2>
      <p>編輯題目，或用流程畫布直覺調整作答順序。</p>
      <button type="button" class="btn-flow" @click="emit('open-flow')">
        🧩 開啟流程編排 <span>{{ questions.length }}</span>
      </button>
    </div>

    <section class="class-mode-panel">
      <button type="button" class="panel-header" @click="emit('update:isClassPanelExpanded', !isClassPanelExpanded)">
        <h3>⚙️ 班級控制</h3>
        <span class="toggle-icon">{{ isClassPanelExpanded ? '▲' : '▼' }}</span>
      </button>
      <div v-show="isClassPanelExpanded" class="panel-content">
        <!-- 新增：顯示 QR Code 的按鈕 -->
        <button v-if="roomCode" class="btn-show-qr" @click="emit('show-qr')">
          📱 顯示加入 QR Code ({{ roomCode }})
        </button>
        <div class="mode-toggle">
          <label>
            <input type="checkbox" :checked="isClassModeToggle"
              @change="emit('update:isClassModeToggle', isChecked($event)); emit('mode-change')" />
            🎓 上課模式 (鎖定學生進度)
          </label>
        </div>
        <div class="target-count">
          <label>目標人數：</label>
          <input type="number" :value="targetCountInput"
            @change="emit('update:targetCountInput', numberValue($event)); emit('mode-change')" />
        </div>
        <button type="button" class="btn-reset-progress" @click="emit('reset-progress')">
          🔄 重置全班作答進度
        </button>
        <!-- 👈 新增：單元鎖定 UI -->
        <div class="unit-lock" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ccc;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #b45309;">🔒 限制學生單元</label>
          <div style="display: flex; gap: 8px;">
            <select :value="activeUnitInput" @change="emit('update:activeUnitInput', ($event.target as HTMLSelectElement).value)" style="flex: 1; padding: 6px; border-radius: 8px; border: 1px solid #ccc;">
              <option value="all">📚 全部單元 (不鎖定)</option>
              <option v-for="unit in availableUnits" :key="unit" :value="unit">{{ unit }}</option>
            </select>
            <button @click="emit('lock-unit')" style="padding: 6px 12px; background: #1cb0f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">發布</button>
          </div>
        </div>
      </div>
    </section>

    <section class="sidebar-section">
      <button type="button" class="section-header" @click="emit('update:isQuestionsExpanded', !isQuestionsExpanded)">
        <h3>📝 題目列表</h3>
        <span class="toggle-icon">{{ isQuestionsExpanded ? '▲' : '▼' }}</span>
      </button>
      <div v-show="isQuestionsExpanded" class="list-wrapper">
        <div class="unit-filter">
          <label for="unit-filter">顯示單元</label>
          <select id="unit-filter" :value="unitFilter" class="grammar-select"
            @change="emit('update:unitFilter', ($event.target as HTMLSelectElement).value as QuestionFilter)">
            <option value="all">全部單元</option>
            <option value="unclassified">未分類</option>
            <option v-for="unit in availableUnits" :key="unit" :value="`unit:${unit}`">{{ unit }}</option>
          </select>
        </div>
        <div class="question-list">
          <div class="question-list-inner">
            <article v-for="(question, index) in filteredQuestions" :key="question.id" class="question-item"
              :class="{ active: editingId === question.id }" @click="emit('edit', question)">
              <div class="q-index">
                第 {{ index + 1 }} 關
                <span class="q-type-tag" :class="question.type">
                  {{ question.type === 'contrast' ? '對比題' : question.type === 'chunk' ? '片語題'
                    : question.type === 'grammar' ? '文法題' : '標準題' }}
                </span>
                <span v-if="question.type === 'standard'" class="q-mode-tag" :class="question.mode || 'build'">
                  {{ (question.mode || 'build') === 'reduce' ? 'Reduce' : 'Build' }}
                </span>
                <span v-if="question.isTimed" class="q-time-tag">🔴 {{ question.timeLimit || 60 }}s</span>
                <span v-else class="q-free-tag">🟢 自由</span>
              </div>
              <div class="q-content">
                <span class="q-noun">{{ question.targetNoun }}</span>
                <span class="q-desc">{{ question.type === 'grammar' ? (question.correctAnswer || []).join(' ')
                  : question.grammarFeature?.relative?.label || '未設定句型' }}</span>
              </div>
              <div class="q-actions">
                <button type="button" class="btn-push" @click.stop="emit('push', question.id)">🚀 發送給全班</button>
                <button type="button" class="btn-delete" title="刪除" @click.stop="emit('delete', question.id)">✕</button>
              </div>
            </article>
          </div>
          <button type="button" class="btn-new" :class="{ active: editingId === null }" @click="emit('new-question')">➕
            新增題目</button>
        </div>
      </div>
    </section>

    <footer class="sidebar-footer">
      <button type="button" class="btn-close" @click="emit('save-close')">✅ 完成備課，開始上課</button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f7f9fc;
  border-right: 1px solid #e5e7eb;
}

.sidebar-header,
.sidebar-footer {
  flex-shrink: 0;
  padding: 18px 20px;
  background: #fff;
}

.sidebar-header {
  border-bottom: 1px solid #e5e7eb;
}

.sidebar-header h2 {
  margin: 0;
  color: #333;
  font-size: 1.15rem;
}

.sidebar-header p {
  margin: 8px 0 14px;
  color: #64748b;
  font-size: .85rem;
}

.btn-flow,
.btn-reset-progress {
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 700;
  cursor: pointer;
}

.class-mode-panel,
.sidebar-section {
  flex-shrink: 0;
  border-bottom: 1px solid #e5e7eb;
}

.panel-header,
.section-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border: 0;
  background: #f0f4f8;
  cursor: pointer;
  text-align: left;
}

.panel-header h3,
.section-header h3 {
  margin: 0;
  color: #1cb0f6;
  font-size: 1rem;
}

.panel-content {
  padding: 12px 20px 16px;
}

.mode-toggle label,
.target-count {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #475569;
  font-size: .9rem;
}

.target-count input {
  width: 72px;
  padding: 6px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.sidebar-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.list-wrapper {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.unit-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.unit-filter label {
  flex-shrink: 0;
  color: #555;
  font-size: .9rem;
  font-weight: 700;
}

.grammar-select {
  min-width: 0;
  flex: 1;
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}

.question-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.question-list-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 2px solid #e5e5e5;
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
}

.question-item:hover,
.question-item.active {
  border-color: #1cb0f6;
}

.question-item.active {
  background: #e6f7ff;
  box-shadow: 0 4px 12px #1cb0f61a;
}

.q-index,
.q-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.q-index {
  color: #1cb0f6;
  font-size: .75rem;
  font-weight: 700;
}

.q-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 20px;
}

.q-noun {
  color: #333;
  font-size: 1.05rem;
  font-weight: 700;
}

.q-desc {
  overflow: hidden;
  color: #777;
  font-size: .85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.q-type-tag,
.q-mode-tag,
.q-time-tag,
.q-free-tag {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: .65rem;
}

.q-type-tag {
  background: #1cb0f6;
  color: #fff;
}

.q-type-tag.contrast {
  background: #ff9800;
}

.q-type-tag.chunk {
  background: #9c27b0;
}

.q-mode-tag.build {
  border: 1px solid #1cb0f6;
  background: #e6f7ff;
  color: #1cb0f6;
}

.q-mode-tag.reduce {
  border: 1px solid #9333ea;
  background: #f3e8ff;
  color: #9333ea;
}

.q-time-tag {
  background: #ffe6e6;
  color: #ff4b4b;
}

.q-free-tag {
  background: #e6f7e6;
  color: #58cc02;
}

.q-actions {
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed #eee;
}

.btn-push {
  padding: 6px 12px;
  border: 2px solid #1cb0f6;
  border-radius: 8px;
  background: #e6f7ff;
  color: #1cb0f6;
  font-size: .85rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-delete {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #ffdfe0;
  color: #ff4b4b;
  cursor: pointer;
}

.btn-new {
  padding: 16px;
  border: 2px dashed #ccc;
  border-radius: 16px;
  background: transparent;
  color: #777;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-new.active {
  border-color: #58cc02;
  background: #f0fff0;
  color: #58cc02;
}

.sidebar-footer {
  border-top: 2px solid #e5e5e5;
}

.btn-close {
  width: 100%;
  padding: 16px;
  border: 0;
  border-bottom: 4px solid #1899d6;
  border-radius: 16px;
  background: #1cb0f6;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 900px) {
  .sidebar {
    width: 260px;
  }

  .sidebar-header {
    padding: 16px;
  }
}

.btn-show-qr {
  width: 100%;
  padding: 10px;
  background: #e6f7ff;
  border: 2px dashed #1cb0f6;
  color: #1cb0f6;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  margin-bottom: 12px;
  transition: all 0.2s;
}
.btn-show-qr:hover {
  background: #1cb0f6;
  color: white;
}
</style>
