<script setup lang="ts">
import { ref } from 'vue';
import type { FormPayload } from '../../domain/QuestionBuilder';
import type { CustomGrammarRule } from '../../rules/types'; // 👈 引入型別
import { grammarChapters } from '../../rules/grammarTopics';
import EditorFormFields from '../EditorFormFields.vue';

const props = defineProps<{
    form: FormPayload;
    errors: string[];
    topicsInSelectedChapter: any[];
    selectedGrammarTopic: any;
    recommendedUiLabel: string;
    handleChapterChange: () => void;
    applyGrammarTopic: (id: string) => void;
    autoChunkGrammarSentence: () => void;
    splitGrammarSentenceManually: () => void;
    updateChunkText: (id: string, val: string) => void;
    handleMorphTargetToggle: (id: string, enabled: boolean) => void;
    updateMorphOptions: (id: string, val: string) => void;
    handleCanvasModeChange: () => void;
}>();

const advancedSettingsExpanded = ref(false);

const newRulePattern = ref('');
const newRuleMessage = ref('');

const addCustomRule = () => {
    if (!newRulePattern.value.trim() || !newRuleMessage.value.trim()) return;

    if (!props.form.customRules) {
        props.form.customRules = [];
    }

    props.form.customRules.push({
        id: `custom-${Date.now()}`,
        wrongPattern: newRulePattern.value.split(',').map(s => s.trim()).filter(Boolean),
        message: newRuleMessage.value.trim(),
        priority: 100,
    });

    newRulePattern.value = '';
    newRuleMessage.value = '';
};

const removeCustomRule = (id: string) => {
    if (!props.form.customRules) return;
    // 👈 補上型別標註 (r: CustomGrammarRule)
    props.form.customRules = props.form.customRules.filter((r: CustomGrammarRule) => r.id !== id);
};
</script>

<template>
    <div class="form-group">
        <label for="grammar-chapter">課綱章節</label>
        <select id="grammar-chapter" v-model.number="form.selectedChapter" class="grammar-select"
            @change="handleChapterChange">
            <option v-if="form.selectedChapter === 0" :value="0" disabled>舊題／自訂考點（保留原設定）</option>
            <option v-for="chapter in grammarChapters" :key="chapter.number" :value="chapter.number">
                第 {{ chapter.number }} 章：{{ chapter.title }}
            </option>
        </select>
    </div>

    <div class="form-group">
        <label for="grammar-topic">具體考點</label>
        <select id="grammar-topic" v-model="form.selectedGrammarTopicId" class="grammar-select"
            :disabled="form.selectedChapter === 0" @change="applyGrammarTopic(form.selectedGrammarTopicId)">
            <option v-for="topic in topicsInSelectedChapter" :key="topic.id" :value="topic.id">{{ topic.title }}
            </option>
        </select>
    </div>

    <div v-if="selectedGrammarTopic" class="grammar-recommendation" role="status">
        <strong>系統推薦：{{ recommendedUiLabel }}</strong>
        <p>{{ selectedGrammarTopic.recommendation }}</p>
        <span>本題唯一操作焦點：{{ selectedGrammarTopic.focus }}</span>
        <small v-if="['MORPH', 'GRAVITY_SWITCH'].includes(selectedGrammarTopic.defaultCanvasMode)">
            請設定至少一個可變形字塊，並提供正確形式。
        </small>
    </div>
    <div v-else class="grammar-recommendation legacy-recommendation" role="status">
        <strong>舊題／自訂考點</strong>
        <p>保留此題原有的文法概念與互動模式。選擇課綱考點後，系統會套用對應推薦。</p>
        <span>目前模式：{{ form.uiMode }}</span>
    </div>

    <EditorFormFields v-model:canvas-mode="form.selectedCanvasMode" v-model:grammar-sentence="form.grammarSentence"
        v-model:grammar-answer="form.grammarAnswer" v-model:target-noun="form.targetNoun"
        v-model:antecedent-number="form.antecedentNumber" :grammar-chunks="form.grammarChunks"
        v-model:status-gap="form.statusGap" v-model:npc-label="form.npcLabel" v-model:matrix-x-input="form.matrixXInput"
        v-model:matrix-y-input="form.matrixYInput" v-model:matrix-correct-x="form.matrixCorrectX"
        v-model:matrix-correct-y="form.matrixCorrectY" v-model:matrix-prompt="form.matrixPrompt"
        v-model:matrix-answer="form.matrixAnswer" v-model:matrix-options-input="form.matrixOptionsInput"
        @auto-chunk="autoChunkGrammarSentence" @split-manually="splitGrammarSentenceManually"
        @update-chunk-text="updateChunkText" @toggle-morph-target="handleMorphTargetToggle"
        @update-morph-options="updateMorphOptions" @mode-change="handleCanvasModeChange" />

    <div class="form-group">
        <button type="button" class="btn-push" @click="advancedSettingsExpanded = !advancedSettingsExpanded">
            {{ advancedSettingsExpanded ? '收合進階設定 ▲' : '展開進階設定 ▼' }}
        </button>
        <div v-show="advancedSettingsExpanded" class="advanced-settings">
            <label><input v-model="form.isTimedForm" type="checkbox" /> 限時挑戰</label>
            <input v-if="form.isTimedForm" v-model.number="form.timeLimitForm" type="number" min="10" step="10"
                placeholder="60 秒" aria-label="限時秒數" />
            <label for="grammar-tags">標籤（逗號分隔）</label>
            <input id="grammar-tags" v-model="form.tagsInput" type="text" placeholder="例如：過去式, 動詞時態" />
            <label for="grammar-speech-rate">TTS 語速</label>
            <input id="grammar-speech-rate" v-model.number="form.speechRate" type="number" min="0.5" max="1.5"
                step="0.1" />

            <!-- Custom Rules Section -->
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #ccc;">
                <label style="font-weight: bold; color: #0ea5e9;">🎯 自訂診斷規則 (L2 Layer)</label>
                <p style="font-size: 0.85rem; color: #666; margin-bottom: 12px;">當學生排出指定錯誤時，立刻給予自訂提示，不需等待 LanguageTool。
                </p>

                <div v-if="form.customRules && form.customRules.length > 0"
                    style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                    <div v-for="rule in form.customRules" :key="rule.id"
                        style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div>
                            <strong style="color: #dc2626;">錯誤字詞：{{ rule.wrongPattern.join(', ') }}</strong>
                            <p style="margin: 4px 0 0; font-size: 0.85rem; color: #475569;">{{ rule.message }}</p>
                        </div>
                        <button type="button" @click="removeCustomRule(rule.id)"
                            style="background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.2rem;">✕</button>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <input v-model="newRulePattern" type="text" placeholder="錯誤樣式 (逗號分隔，例如：go, goes)"
                        style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem;" />
                    <input v-model="newRuleMessage" type="text" placeholder="給學生的提示 (例如：注意 yesterday，這裡要用過去式 went 喔！)"
                        style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem;" />
                    <button type="button" @click="addCustomRule"
                        style="align-self: flex-start; background: #0ea5e9; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">＋
                        新增規則</button>
                </div>
            </div>
        </div>
    </div>

    <p v-if="errors.length > 0" class="grammar-error" role="alert">{{ errors[0] }}</p>
</template>

<style scoped>
.form-group {
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
}

.form-group label {
    font-weight: bold;
    margin-bottom: 10px;
    color: #555;
    font-size: 0.95rem;
}

.grammar-select {
    padding: 14px;
    border: 2px solid #e5e5e5;
    border-radius: 12px;
    font-size: 1.05rem;
    outline: none;
    transition: border 0.2s;
    background: #fafafa;
    width: 100%;
    box-sizing: border-box;
}

.grammar-select:focus {
    border-color: #1cb0f6;
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.1);
}

.form-group input[type="text"],
.form-group input[type="number"] {
    padding: 14px;
    border: 2px solid #e5e5e5;
    border-radius: 12px;
    font-size: 1.05rem;
    outline: none;
    transition: border 0.2s;
    background: #fafafa;
    width: 100%;
    box-sizing: border-box;
}

.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus {
    border-color: #1cb0f6;
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.1);
}

.grammar-recommendation {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 20px;
    padding: 14px 16px;
    border: 1px solid #bae6fd;
    border-radius: 12px;
    background: #f0f9ff;
    color: #0c4a6e;
}

.grammar-recommendation p {
    margin: 0;
    color: #334155;
}

.grammar-recommendation span,
.grammar-recommendation small {
    color: #475569;
    line-height: 1.5;
}

.grammar-recommendation small {
    color: #7c3aed;
    font-weight: 700;
}

.legacy-recommendation {
    border-color: #e2e8f0;
    background: #f8fafc;
}

.grammar-error {
    margin: 10px 0 0;
    font-weight: 600;
    color: #d32f2f;
}

.btn-push {
    background: #e6f7ff;
    color: #1cb0f6;
    border: 2px solid #1cb0f6;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.85rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-push:hover {
    background: #1cb0f6;
    color: white;
}

.advanced-settings {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: #f9f9f9;
    border-radius: 12px;
}
</style>