<script setup lang="ts">
import { computed } from 'vue';
import type { FormPayload } from '../../domain/QuestionBuilder';

const props = defineProps<{
    form: FormPayload;
    activeUploadTarget: string | null;
    triggerUpload: (target: 'noun' | 'distractor' | 'modifier') => void;
    handleFileChange: (event: Event) => void;
    toggleDistractor: (word: string) => void;
    isDistractorActive: (word: string) => boolean;
}>();

// 專屬這個表單的 computed (從原本的 TeacherAdmin 搬過來)
const funnelDiscarded = computed(() =>
    props.form.relativeSentence.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim()
);

// 所有可能的階段（保持固定順序作為預設/可選項目）
const allStages = [
    { value: 'input', label: '聽力輸入', condition: (f: FormPayload) => f.questionType === 'standard' },
    { value: 'macro', label: '巨觀拖拉', condition: (f: FormPayload) => f.questionType === 'standard' && f.questionMode !== 'reduce' },
    { value: 'micro', label: '字磚重組', condition: () => true },
    { value: 'pronunciation', label: '語音練習', condition: () => true },
    { value: 'noticing', label: '意識提升', condition: () => true },
] as const;

// 可用的階段（根據條件過濾）
const availableStages = computed(() =>
    allStages.filter(s => s.condition(props.form))
);

// 目前已啟用的階段（陣列順序 = 執行順序）
const enabledStages = computed(() => props.form.enabledStages);

// 切換階段啟用/停用
const toggleStage = (stage: string) => {
    const idx = props.form.enabledStages.indexOf(stage);
    if (idx === -1) {
        props.form.enabledStages.push(stage);
    } else {
        props.form.enabledStages.splice(idx, 1);
    }
};

// 上移
const moveUp = (idx: number) => {
    if (idx > 0) {
        const arr = [...props.form.enabledStages];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        props.form.enabledStages = arr;
    }
};

// 下移
const moveDown = (idx: number) => {
    if (idx < props.form.enabledStages.length - 1) {
        const arr = [...props.form.enabledStages];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        props.form.enabledStages = arr;
    }
};

// 檢查階段是否已啟用
const isStageEnabled = (stage: string) => props.form.enabledStages.includes(stage);

// 取得階段顯示名稱
const getStageLabel = (stage: string) => {
    const found = allStages.find(s => s.value === stage);
    return found ? found.label : stage;
};

</script>

<template>
    <div class="form-group" v-if="form.questionType !== 'chunk'">
        <label>題目節奏</label>
        <div class="segmented-control">
            <button :class="{ active: !form.isTimedForm }" @click="form.isTimedForm = false">🟢 自由進度</button>
            <button :class="{ active: form.isTimedForm }" @click="form.isTimedForm = true">🔴 限時挑戰</button>
        </div>
    </div>

    <div class="form-group" v-if="form.isTimedForm && form.questionType !== 'chunk'">
        <label>⏱️ 限時秒數</label>
        <input type="number" v-model.number="form.timeLimitForm" placeholder="60" min="10" step="10" />
    </div>

    <div class="form-group" v-if="form.questionType !== 'chunk'">
        <label>本題教學流程</label>
        <div class="stage-order">
            <div v-for="(stage, idx) in enabledStages" :key="stage" class="stage-item">
                <span class="stage-label">{{ getStageLabel(stage) }}</span>
                <button @click="moveUp(idx)" class="stage-move-up">▲</button>
                <button @click="moveDown(idx)" class="stage-move-down">▼</button>
            </div>
        </div>
    </div>

    <div class="form-group" v-if="form.questionType === 'standard'">
        <label>題目模式</label>
        <div class="type-switcher">
            <button :class="{ active: form.questionMode === 'build' }" @click="form.questionMode = 'build'">一般組句題
                (Build)</button>
            <button :class="{ active: form.questionMode === 'reduce' }" @click="form.questionMode = 'reduce'">關係子句轉換題
                (Reduce)</button>
        </div>
    </div>

    <div class="form-group">
        <label>TTS 語音速度</label>
        <div class="type-switcher">
            <button :class="{ active: form.speechRate === 0.5 }" @click="form.speechRate = 0.5">🐢 慢速 (0.5)</button>
            <button :class="{ active: form.speechRate === 0.8 }" @click="form.speechRate = 0.8">🚶 適中 (0.8)</button>
            <button :class="{ active: form.speechRate === 1.0 }" @click="form.speechRate = 1.0">🏃 正常 (1.0)</button>
        </div>
    </div>

    <template v-if="form.questionType === 'chunk'">
        <div class="form-group">
            <label>片語內容 (用 [ ] 包住要測驗的片語)</label>
            <input v-model="form.relativeSentence" type="text" placeholder="Ex: [looking up words]" />
        </div>
        <div class="form-group">
            <label>片語中文意思</label>
            <input v-model="form.chunkZhInput" type="text" placeholder="Ex: 查單字" />
        </div>
        <div class="form-group">
            <label>錯誤片語選項 (用逗號隔開，供微測驗用)</label>
            <input v-model="form.chunkQuizInput" type="text"
                placeholder="Ex: looking for his pen, looking at the board" />
        </div>
    </template>

    <div class="form-group">
        <label>{{ form.questionType === 'contrast' ? '名詞圖片 (拼圖右側)' : form.questionType === 'chunk' ? '片語情境圖片' : '正確角色圖片'
            }}</label>
        <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'noun' }"
            @click="triggerUpload('noun')">
            <img v-if="form.imageUrl" :src="form.imageUrl" class="preview-img" />
            <div v-else class="upload-placeholder"><span class="icon">📸</span><span>點擊上傳或貼上正確圖片</span></div>
        </div>
    </div>

    <template v-if="form.questionType !== 'chunk'">
        <div class="form-group" v-if="form.questionType === 'standard'">
            <label>干擾圖片 (選填，聽力測驗的錯誤選項圖)</label>
            <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'distractor' }"
                @click="triggerUpload('distractor')">
                <img v-if="form.distractorImageUrl" :src="form.distractorImageUrl" class="preview-img" />
                <div v-else class="upload-placeholder"><span class="icon">🐱</span><span>點擊上傳干擾圖片</span></div>
            </div>
        </div>
        <div class="form-group" v-if="form.questionType === 'contrast'">
            <label>修飾語圖片 (拼圖左側)</label>
            <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'modifier' }"
                @click="triggerUpload('modifier')">
                <img v-if="form.modifierImageUrl" :src="form.modifierImageUrl" class="preview-img" />
                <div v-else class="upload-placeholder"><span class="icon">🧩</span><span>點擊上傳修飾語圖片</span></div>
            </div>
        </div>
    </template>

    <div class="form-row">
        <div class="form-group">
            <label>目標名詞</label>
            <input v-model="form.targetNoun" type="text" placeholder="Ex: The boy"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
        <div class="form-group">
            <label>心智圖標籤 (Tags)</label>
            <input v-model="form.tagsInput" type="text" placeholder="Ex: 穿著與顏色"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
    </div>

    <div class="form-group" v-if="form.questionType !== 'chunk'">
        <label>先行詞單複數 (影響動詞一致性判斷)</label>
        <div class="type-switcher">
            <button :class="{ active: form.antecedentNumber === 'singular' }"
                @click="form.antecedentNumber = 'singular'">單數
                (Singular)</button>
            <button :class="{ active: form.antecedentNumber === 'plural' }" @click="form.antecedentNumber = 'plural'">複數
                (Plural)</button>
        </div>
    </div>

    <div class="form-group" v-if="form.questionType !== 'chunk'">
        <label>先行詞類別 (影響 who/which 判斷)</label>
        <div class="type-switcher">
            <button type="button" :class="{ active: form.antecedentPerson === 'person' }"
                @click="form.antecedentPerson = 'person'">人 (Person)</button>
            <button type="button" :class="{ active: form.antecedentPerson === 'thing' }"
                @click="form.antecedentPerson = 'thing'">物 (Thing)</button>
        </div>
    </div>

    <div class="form-group" v-if="form.questionType !== 'chunk'">
        <label style="display: flex; justify-content: space-between;">
            <span>句型 A：關係子句 (漏斗入口)</span>
            <span v-if="form.questionMode === 'reduce'" style="color: #1cb0f6; font-size: 0.8rem;">💡 用 [ ]
                框住要保留的片語</span>
        </label>
        <input v-model="form.relativeSentence" type="text"
            :placeholder="form.questionMode === 'reduce' ? 'Ex: who wears [a blue uniform]' : 'Ex: who wears a blue uniform'"
            @focus="$emit('update:activeUploadTarget', null)" />
    </div>

    <div v-if="form.questionType === 'standard' && form.questionMode === 'reduce'" class="funnel-preview">
        <div class="funnel-title">🔍 系統自動拆解預覽 (可手動修改保留內容)</div>
        <div class="funnel-row">
            <span class="funnel-label" style="color: #166534;">🟢 保留 (簡化句)</span>
            <input v-model="form.prepositionSentence" type="text" class="funnel-input-kept"
                placeholder="Ex: [with a dictionary]" />
        </div>
        <div class="funnel-row">
            <span class="funnel-label">🗑️ 丟棄 (垃圾桶)</span>
            <span class="funnel-value discarded">{{ funnelDiscarded || '（無多餘詞彙）' }}</span>
        </div>
        <p
            style="font-size: 0.85rem; color: #b45309; margin-top: 8px; background: #fef3c7; padding: 8px; border-radius: 8px;">
            💡 提示：如果「動詞」要轉換為「介系詞」（例如 who is carrying ➔ with），請直接在綠色框內加上介系詞，系統會自動把該字加入學生的字磚庫。
        </p>
    </div>

    <div class="form-group" v-if="form.questionType === 'standard'">
        <label>迷思干擾磚 (點擊下方標籤快速加入)</label>
        <div class="distractor-tags">
            <button v-for="tag in ['she', 'he', 'it', 'they']" :key="tag" :class="{ active: isDistractorActive(tag) }"
                @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
            <div class="divider"></div>
            <button v-for="tag in ['wear', 'have', 'live', 'look']" :key="tag"
                :class="{ active: isDistractorActive(tag) }" @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
            <div class="divider"></div>
            <button v-for="tag in ['who', 'which']" :key="tag" :class="{ active: isDistractorActive(tag) }"
                @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
        </div>
        <input v-model="form.distractorsInput" type="text" placeholder="或手動輸入其他干擾磚 (用逗號隔開)" style="margin-top: 12px;"
            @focus="$emit('update:activeUploadTarget', null)" />
    </div>

    <div class="form-group" v-if="form.questionType === 'standard'">
        <label>克漏字上下文 (選填，若填寫將用於 TTS 發音句子)</label>
        <div style="display: flex; gap: 8px; align-items: center;">
            <input v-model="form.clozePrefix" type="text" placeholder="Ex: The boy" style="flex: 1;"
                @focus="$emit('update:activeUploadTarget', null)" />
            <span style="font-weight: bold; color: #777;">[ 修飾語 ]</span>
            <input v-model="form.clozeSuffix" type="text" placeholder="Ex: is my brother." style="flex: 1;"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
    </div>

    <div class="form-row" v-if="form.questionType === 'standard'">
        <div class="form-group">
            <label>正確圖下方文字 (選填)</label>
            <input v-model="form.correctLabel" type="text" placeholder="Ex: who is looking up words"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
        <div class="form-group">
            <label>干擾圖下方文字 (選填)</label>
            <input v-model="form.distractorLabel" type="text" placeholder="Ex: who is looking for his pen"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
    </div>

    <template v-if="form.questionType === 'contrast'">
        <div class="form-group">
            <label>中文句子</label>
            <input v-model="form.chineseSentence" type="text" placeholder="Ex: 戴藍色帽子的女孩"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
        <div class="form-group">
            <label>中文高亮 (修飾語部分)</label>
            <input v-model="form.chineseHighlight" type="text" placeholder="Ex: 戴藍色帽子的"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
        <div class="form-group">
            <label>拼圖排列方向</label>
            <div class="type-switcher">
                <button :class="{ active: form.puzzleLayout === 'modifier-left' }"
                    @click="form.puzzleLayout = 'modifier-left'">佈局 A (修飾語在左)</button>
                <button :class="{ active: form.puzzleLayout === 'modifier-right' }"
                    @click="form.puzzleLayout = 'modifier-right'">佈局 B (修飾語在右)</button>
            </div>
        </div>
        <div class="form-group">
            <label>解釋卡標題</label>
            <input v-model="form.explanationTitle" type="text" placeholder="Ex: ✨ 你發現了嗎？"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
        <div class="form-group">
            <label>解釋卡說明</label>
            <input v-model="form.explanationDesc" type="text" placeholder="Ex: 修飾語要放在名詞的後面喔！"
                @focus="$emit('update:activeUploadTarget', null)" />
        </div>
    </template>
</template>

<style scoped>
/* 搬移相關的共用與專屬樣式 */
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

.form-row {
    display: flex;
    gap: 16px;
}

.form-row .form-group {
    flex: 1;
}

.upload-area {
    border: 2px dashed #ccc;
    border-radius: 16px;
    height: 160px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    overflow: hidden;
    background: #fafafa;
    transition: all 0.2s;
}

.upload-area:hover {
    border-color: #1cb0f6;
    background: #e6f7ff;
}

.upload-area.active-upload {
    border-color: #58cc02;
    background: #f0fff0;
    box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.2);
}

.upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #999;
    font-weight: bold;
}

.upload-placeholder .icon {
    font-size: 2rem;
}

.preview-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.stage-checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    background: #f9f9f9;
    padding: 16px;
    border-radius: 12px;
    border: 2px solid #e5e5e5;
}

.stage-checkboxes label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: bold;
    color: #555;
    cursor: pointer;
    margin-bottom: 0;
}

.stage-checkboxes input {
    width: 18px;
    height: 18px;
    accent-color: #1cb0f6;
    cursor: pointer;
}

.segmented-control {
    display: flex;
    background: #f0f0f0;
    border-radius: 12px;
    padding: 4px;
}

.segmented-control button {
    flex: 1;
    padding: 10px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-weight: bold;
    color: #777;
    cursor: pointer;
    transition: all 0.2s;
}

.segmented-control button.active {
    background: white;
    color: #1cb0f6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.type-switcher {
    display: flex;
    gap: 10px;
    margin-top: 16px;
}

.type-switcher button {
    flex: 1;
    padding: 10px;
    background: #f0f0f0;
    border: 2px solid transparent;
    border-radius: 12px;
    font-weight: bold;
    color: #777;
    cursor: pointer;
    transition: all 0.2s;
}

.type-switcher button.active {
    background: #e6f7ff;
    border-color: #1cb0f6;
    color: #1cb0f6;
}

.distractor-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    background: #f9f9f9;
    padding: 12px;
    border-radius: 12px;
    border: 2px solid #e5e5e5;
}

.distractor-tags button {
    background: white;
    border: 2px solid #ccc;
    color: #777;
    padding: 6px 16px;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
}

.distractor-tags button:hover {
    border-color: #1cb0f6;
    color: #1cb0f6;
}

.distractor-tags button.active {
    background: #e6f7ff;
    border-color: #1cb0f6;
    color: #1cb0f6;
    box-shadow: 0 2px 4px rgba(28, 176, 246, 0.2);
}

.distractor-tags .divider {
    width: 2px;
    height: 20px;
    background: #e5e5e5;
    margin: 0 4px;
}

.funnel-preview {
    background: #f0f4f8;
    border: 2px dashed #cbd5e1;
    border-radius: 16px;
    padding: 16px 24px;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: fadeIn 0.3s ease;
}

.funnel-title {
    font-weight: bold;
    color: #475569;
    font-size: 0.9rem;
    margin-bottom: 4px;
}

.funnel-row {
    display: flex;
    align-items: center;
    gap: 16px;
}

.funnel-label {
    font-size: 0.85rem;
    color: #64748b;
    width: 100px;
    flex-shrink: 0;
}

.funnel-input-kept {
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 1.05rem;
    flex: 1;
    background: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
    outline: none;
    transition: all 0.2s;
}

.funnel-input-kept:focus {
    border-color: #58cc02;
    background: white;
    box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.2);
}

.funnel-value.discarded {
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 1.05rem;
    flex: 1;
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
    text-decoration: line-through;
    opacity: 0.7;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-5px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.stage-order {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.stage-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-radius: 0 4px 4px 0;
    cursor: pointer;
    transition: background 0.2s;
}

.stage-label {
    font-size: 0.85rem;
    color: #475569;
    width: 100px;
    flex-shrink: 0;
}

.stage-move-up, .stage-move-down {
    background: none;
    border: none;
    color: #1cb0f6;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    transition: transform 0.15s;
}

.stage-move-up:hover, .stage-move-down:hover {
    transform: scale(1.2);
}

@media (max-width: 500px) {
    .type-switcher {
        flex-wrap: wrap;
    }

    .type-switcher button {
        min-width: 42%;
        font-size: 0.8rem;
    }

    .form-row {
        flex-direction: column;
        gap: 8px;
    }
}
</style>