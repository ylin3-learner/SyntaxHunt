<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { CloudDatabase, type LearningLog } from '../services/CloudDatabase';
import type { QuestionData, SSTCategory } from '../rules/types';
import { supabase } from '../services/supabaseClient';

const props = defineProps<{
    questionBank: QuestionData[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const logs = ref<LearningLog[]>([]);
const isLoading = ref(true);
const isClearing = ref(false);
const expandedCode = ref<string | null>(null);
let learningLogsChannel: ReturnType<typeof supabase.channel> | undefined;

const loadData = async (preserveRealtimeUpdates = true) => {
    isLoading.value = true;
    const fetched = await CloudDatabase.fetchLogs();
    const latestById = new Map<number, LearningLog>();
    fetched.forEach(log => {
        if (typeof log.id === 'number') latestById.set(log.id, log);
    });
    if (preserveRealtimeUpdates) {
        logs.value.filter(log => typeof log.id === 'number')
            .forEach(log => latestById.set(log.id!, log));
    }
    logs.value = [...latestById.values()].sort((left, right) =>
        (right.created_at ?? '').localeCompare(left.created_at ?? '')
    );
    isLoading.value = false;
};

const applyRealtimeLog = (payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
}) => {
    if (payload.eventType === 'DELETE') {
        const deletedId = payload.old.id;
        logs.value = logs.value.filter(log => log.id !== deletedId);
        return;
    }

    const incoming = payload.new as unknown as LearningLog;
    if (typeof incoming.id !== 'number') return;
    const index = logs.value.findIndex(log => log.id === incoming.id);
    if (index === -1) logs.value.unshift(incoming);
    else logs.value[index] = incoming;
};

onMounted(async () => {
    learningLogsChannel = supabase
        .channel('teacher-analytics-learning-logs')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'learning_logs',
        }, applyRealtimeLog)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('教師看板 Realtime 訂閱失敗:', status);
            }
        });
    await loadData();
});

onUnmounted(() => {
    if (learningLogsChannel) void supabase.removeChannel(learningLogsChannel);
});

const handleClearLogs = async () => {
    const confirmed = confirm('確定要清空所有學生的作答紀錄嗎？此操作無法復原喔！');
    if (!confirmed) return;

    isClearing.value = true;
    const success = await CloudDatabase.clearAllLogs();

    if (success) {
        alert('✅ 已成功清空所有紀錄！');
        await loadData(false);
    } else {
        alert('❌ 清空失敗，請確認網路連線。');
    }
    isClearing.value = false;
};

const toggleNode = (code: string) => {
    expandedCode.value = expandedCode.value === code ? null : code;
};

const adviceDictionary: Record<string, string> = {
    'DUPLICATE_PRONOUN': '學生尚未理解關代已代替先行詞。請提醒：關代後面直接接動詞，不需要再加 she/he/it。',
    'WRONG_RELATIVE': '學生混淆了先行詞的屬性。請提醒：先行詞是「人」用 who，是「物」用 which。',
    'SV_AGREEMENT': '學生沒注意到關代動詞要與先行詞單複數一致。請提醒：動詞單複數看「先行詞」。',
    'NOT_REDUCED': '學生在轉換題保留了關代。請提醒：關代（that/which）在轉換時要直接刪除。',
    'INCOMPLETE_REDUCTION': '學生刪了關代，卻忘了刪 be 動詞。請提醒：關代與 be 動詞必須「一起」省略。',
    'WRONG_ORDER': '學生排列正確，但語序有誤。請提醒他們檢查「名詞 + 關代 + 動詞」的順序。',
    'PUZZLE_ERROR': '學生將修飾語放錯位置（可能受中文干擾）。請提醒：英文修飾語要放在名詞「後面」。',
    'M:VERB': '學生漏掉了句子必要的動詞。請一起找出主詞和句子的主要動作。',
    'M:AUX': '學生漏掉助動詞或 be 動詞。請檢查時態、疑問句或被動結構。',
    'M:DET': '學生漏掉冠詞。請確認可數名詞前是否需要 a、an 或 the。',
    'M:PREP': '學生漏掉介系詞。可用位置、時間或動詞搭配線索補上必要介系詞。',
    'R:VERB:TENSE': '學生選錯動詞形式。請利用時間線索和句子中的助動詞檢查時態。',
    'R:VERB:FORM': '情態助動詞或其他結構後的動詞形式有誤，請檢查動詞是否應使用原形。',
    'R:VERB:MOOD': '學生使用的語氣形式不符合假設情境，請檢查句子表達的是事實還是假設。',
    'R:VERB:SVA': '學生尚未掌握主詞與動詞一致。請先找主詞，再判斷動詞單複數。',
    'R:CONJ': '學生選錯子句連接詞，請依句意判斷兩個子句的邏輯關係。',
    'M:CONJ': '學生漏掉子句連接詞，請檢查子句之間的關係。',
    'U:CONJ': '學生加入了不需要的連接詞，請檢查句子結構。',
    'R:PREP': '學生混淆介系詞。可用位置、時間或搭配詞線索重新辨認。',
    'R:DET': '學生混淆 a/an。提醒依後面單字的起始發音選擇。',
    'R:NOUN:NUM': '學生混淆名詞單複數。請檢查數量詞和名詞詞尾。',
    'R:RELATIVE': '學生混淆關係代名詞。請根據先行詞是人或物判斷。',
    'U:PRON': '學生加入重複代名詞。提醒 who/which/that 已代替先行詞。',
    'U:VERB': '學生可能保留了多餘動詞。請檢查助動詞及句型是否重複。',
    'U:RELATIVE': '學生保留了不需要的關係代名詞。請依題目模式檢查是否需刪除。',
    'O:WRONG_ORDER': '學生選字正確但排列錯誤。請標示主詞、動詞和修飾語後重排。',
    'O:INVERSION': '學生可能把主詞和助動詞的位置倒置。請先確定句型是否需要倒裝。'
};

const titleDictionary: Record<string, string> = {
    'DUPLICATE_PRONOUN': '重複代名詞',
    'WRONG_RELATIVE': '關代選擇錯誤',
    'SV_AGREEMENT': '主謂不一致',
    'NOT_REDUCED': '未簡化轉換',
    'INCOMPLETE_REDUCTION': '未完全簡化',
    'WRONG_ORDER': '字序錯誤',
    'PUZZLE_ERROR': '拼圖方向錯誤',
    'M:VERB': '遺漏動詞',
    'M:AUX': '遺漏助動詞',
    'M:DET': '遺漏冠詞',
    'M:PREP': '遺漏介系詞',
    'R:VERB:TENSE': '動詞時態錯誤',
    'R:VERB:FORM': '動詞形式錯誤',
    'R:VERB:MOOD': '語氣形式錯誤',
    'R:VERB:SVA': '主詞與動詞單複數不一致',
    'R:CONJ': '連接詞使用錯誤',
    'M:CONJ': '遺漏連接詞',
    'U:CONJ': '多餘連接詞',
    'R:PREP': '介系詞使用錯誤',
    'R:DET': '冠詞使用錯誤',
    'R:NOUN:NUM': '名詞單複數錯誤',
    'R:RELATIVE': '關係代名詞選擇錯誤',
    'U:PRON': '多餘代名詞',
    'U:VERB': '多餘動詞',
    'U:RELATIVE': '多餘關係代名詞',
    'O:WRONG_ORDER': '語序錯誤',
    'O:INVERSION': '倒裝語序錯誤',
    'UNKNOWN_ERROR': '其他文法錯誤'
};

const sstLabels: Record<SSTCategory, string> = {
    Omission: '遺漏',
    Addition: '多加',
    Misformation: '形式錯誤',
    Misordering: '語序錯誤',
};

const inferSst = (log: LearningLog): SSTCategory => {
    if (log.sst) return log.sst;
    if (log.error_code.startsWith('M:')) return 'Omission';
    if (log.error_code.startsWith('U:')) return 'Addition';
    if (log.error_code.startsWith('O:')) return 'Misordering';
    return 'Misformation';
};

const sstDistribution = computed(() => {
    const categories: SSTCategory[] = ['Omission', 'Addition', 'Misformation', 'Misordering'];
    const counts = categories.map(category => ({
        category,
        label: sstLabels[category],
        count: logs.value.filter(log =>
            log.source !== 'languagetool'
            && log.error_code !== 'CHUNK_DISTRACTOR'
            &&
            log.error_code !== 'SUCCESS'
            && log.status !== 'PENDING'
            && inferSst(log) === category
        ).length,
    }));
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return counts.map(item => ({
        ...item,
        percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
    }));
});

const sstPieStyle = computed(() => {
      const total = sstDistribution.value.reduce((sum, item) => sum + item.count, 0);
      if (total === 0) return { background: '#edf0f3' };

      const colors: Record<SSTCategory, string> = {
          Omission: '#1cb0f6',
          Addition: '#ff9800',
          Misformation: '#ff4b4b',
          Misordering: '#9c27b0',
      };
      let start = 0;
      const segments = sstDistribution.value.map(item => {
          const end = start + (item.count / total) * 100;
          const segment = `${colors[item.category]} ${start}% ${end}%`;
          start = end;
          return segment;
      });
      return { background: `conic-gradient(${segments.join(', ')})` };
});

const languageToolStats = computed(() => {
    const grouped = new Map<string, { category: string; ruleId: string; count: number }>();
    logs.value.filter(log => log.source === 'languagetool').forEach(log => {
        const category = log.category || '未分類';
        const ruleId = log.rule_id || log.error_code;
        const key = `${category}\u0000${ruleId}`;
        const item = grouped.get(key);
        if (item) item.count += 1;
        else grouped.set(key, { category, ruleId, count: 1 });
    });
    return [...grouped.values()].sort((left, right) => right.count - left.count);
});

const chunkDistractorStats = computed(() => {
    const grouped = new Map<string, { questionId: string; questionText: string; option: string; count: number }>();
    logs.value.filter(log => log.error_code === 'CHUNK_DISTRACTOR').forEach(log => {
        const option = log.rule_id || '未記錄選項';
        const key = `${log.question_id}\u0000${option}`;
        const item = grouped.get(key);
        if (item) item.count += 1;
        else {
            const question = props.questionBank.find(candidate => candidate.id === log.question_id);
            grouped.set(key, {
                questionId: log.question_id,
                questionText: question?.previewData
                    ? `${question.previewData.targetNoun} [ ${question.previewData.chunkText} ]`
                    : log.question_id,
                option,
                count: 1,
            });
        }
    });
    return [...grouped.values()].sort((left, right) => right.count - left.count);
});

interface SubNode {
    questionId: string;
    questionText: string;
    count: number;
}

interface ErrorNode {
    code: string;
    name: string;
    totalCount: number;
    advice: string;
    subNodes: SubNode[];
}

// 👇 核心邏輯：將資料分群成雙層結構，並加入克漏字上下文
const errorTree = computed<ErrorNode[]>(() => {
    const errorLogs = logs.value.filter(log =>
        log.source !== 'languagetool'
        &&
        log.error_code !== 'CHUNK_DISTRACTOR'
        &&
        log.error_code !== 'SUCCESS' && log.status !== 'PENDING'
    );
    const counts: Record<string, { total: number; questions: Record<string, number> }> = {};

    errorLogs.forEach(log => {
        if (!counts[log.error_code]) {
            counts[log.error_code] = { total: 0, questions: {} };
        }
        counts[log.error_code].total += 1;
        counts[log.error_code].questions[log.question_id] =
            (counts[log.error_code].questions[log.question_id] || 0) + 1;
    });

    return Object.entries(counts)
        .map(([code, data]) => {
            const subNodes: SubNode[] = Object.entries(data.questions).map(([qid, qCount]) => {
                const targetQ = props.questionBank.find(q => q.id === qid);
                let qText = '（題目已被刪除）';

                if (targetQ) {
                    const noun = targetQ.targetNoun;
                    const modifier = targetQ.grammarFeature?.relative?.label
                        || targetQ.correctAnswer?.join(' ')
                        || '';

                    // 👇 如果有克漏字上下文，就把它們組合起來
                    if (targetQ.contextCloze) {
                        qText = `${targetQ.contextCloze.prefix} [ ${modifier} ] ${targetQ.contextCloze.suffix}`;
                    } else {
                        // 沒有上下文的舊題目，退回原本的顯示方式
                        qText = `${noun} [ ${modifier} ]`;
                    }
                }

                return {
                    questionId: qid,
                    questionText: qText,
                    count: qCount
                };
            }).sort((a, b) => b.count - a.count);

            return {
                code,
                name: titleDictionary[code] || code,
                totalCount: data.total,
                advice: adviceDictionary[code] || '請參考課本對應文法單元。',
                subNodes
            };
        })
        .sort((a, b) => b.totalCount - a.totalCount);
});
</script>

<template>
    <div class="analytics-overlay">
        <div class="analytics-card">
            <div class="header">
                <h2>📊 學習診斷與教學處方</h2>
                <div class="header-actions">
                    <button class="btn-clear" @click="handleClearLogs" :disabled="isClearing || logs.length === 0">
                        {{ isClearing ? '清空中...' : '🗑️ 清空紀錄' }}
                    </button>
                    <button class="btn-close" @click="emit('close')">✕</button>
                </div>
            </div>

            <div v-if="isLoading" class="loading">正在載入數據...</div>

            <div v-else-if="logs.length === 0" class="empty">
                目前尚無數據。請讓學生開始遊玩以收集軌跡。
            </div>

            <div v-else class="stats-container">
                <p class="subtitle">總計收集 {{ logs.length }} 筆學習紀錄（點擊展開錯誤題目）</p>

                <section class="sst-chart" aria-label="本地規則引擎錯誤比例">
                    <h3>SST 四類錯誤策略</h3>
                    <div class="sst-pie-layout">
                        <div class="sst-pie" :style="sstPieStyle" role="img" aria-label="四類錯誤比例圓餅圖">
                            <div class="sst-pie-center">錯誤<br />分布</div>
                        </div>
                        <div class="sst-legend">
                            <div v-for="item in sstDistribution" :key="item.category" class="sst-legend-item">
                                <span class="sst-swatch" :class="item.category"></span>
                                <span>{{ item.label }}</span>
                                <strong>{{ item.count }} 次（{{ item.percent }}%）</strong>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="language-tool-chart" aria-label="LanguageTool 原生錯誤統計">
                    <h3>LanguageTool 原生分類與規則</h3>
                    <p v-if="languageToolStats.length === 0" class="language-tool-empty">
                        尚無 LanguageTool 診斷紀錄。
                    </p>
                    <div v-else class="language-tool-list">
                        <div v-for="item in languageToolStats"
                            :key="`${item.category}-${item.ruleId}`" class="language-tool-row">
                            <span>{{ item.category }}</span>
                            <code>{{ item.ruleId }}</code>
                            <strong>{{ item.count }} 次</strong>
                        </div>
                    </div>
                </section>

                <section class="phrase-distractor-chart" aria-label="片語題錯誤選項統計">
                    <h3>片語題錯誤選項</h3>
                    <p v-if="chunkDistractorStats.length === 0" class="language-tool-empty">
                        尚無片語題錯誤選項紀錄。
                    </p>
                    <div v-else class="phrase-distractor-list">
                        <div v-for="item in chunkDistractorStats"
                            :key="`${item.questionId}-${item.option}`" class="phrase-distractor-row">
                            <span>{{ item.questionText }}</span>
                            <code>{{ item.option }}</code>
                            <strong>{{ item.count }} 次</strong>
                        </div>
                    </div>
                </section>

                <div class="mindmap">
                    <div class="mindmap-root">
                        <div class="root-node">🧠 全班學習痛點</div>
                        <div class="root-line"></div>
                    </div>

                    <div class="mindmap-branches">
                        <!-- Layer 1: 錯誤類型 -->
                        <div v-for="node in errorTree" :key="node.code" class="branch-wrapper">
                            <div class="branch-node" :class="{ 'expanded': expandedCode === node.code }"
                                @click="toggleNode(node.code)">
                                <span class="node-name">{{ node.name }}</span>
                                <span class="node-count">{{ node.totalCount }} 次</span>
                            </div>

                            <!-- Layer 2: 具體題目 -->
                            <Transition name="slide">
                                <div v-if="expandedCode === node.code" class="prescription-card">
                                    <div class="prescription-header">💡 教學處方</div>
                                    <p class="advice-text">{{ node.advice }}</p>

                                    <!-- 顯示出錯的具體題目 -->
                                    <div class="question-list">
                                        <div class="question-list-title">出錯題目統計：</div>
                                        <div v-for="sub in node.subNodes" :key="sub.questionId" class="question-item">
                                            <span class="q-text">{{ sub.questionText }}</span>
                                            <span class="q-count">錯 {{ sub.count }} 次</span>
                                        </div>
                                    </div>
                                </div>
                            </Transition>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 樣式保持不變，微調處方卡片內的題目列表 */
.analytics-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
}

.analytics-card {
    background: white;
    width: 90vw;
    max-width: 650px;
    max-height: 85vh;
    border-radius: 24px;
    padding: 32px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: popIn 0.3s ease;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 2px solid #eee;
    padding-bottom: 16px;
    flex-shrink: 0;
}

.header h2 {
    margin: 0;
    color: #1cb0f6;
    font-size: 1.5rem;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.btn-clear {
    background: #ffdfe0;
    color: #ff4b4b;
    border: 2px solid #ff4b4b;
    padding: 6px 12px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-clear:hover:not(:disabled) {
    background: #ff4b4b;
    color: white;
}

.btn-clear:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: #ccc;
    background: #f0f0f0;
    color: #999;
}

.btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #999;
}

.btn-close:hover {
    color: #ff4b4b;
}

.loading,
.empty {
    text-align: center;
    color: #777;
    padding: 40px 0;
    font-size: 1.1rem;
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
}

.subtitle {
    color: #777;
    margin-bottom: 24px;
    font-weight: bold;
    font-size: 0.95rem;
}

.stats-container {
    overflow-y: auto;
    padding-right: 10px;
}

.sst-chart {
    margin-bottom: 28px;
    padding: 18px;
    border: 1px solid #e5e5e5;
    border-radius: 14px;
    background: #fff;
}

.sst-chart h3 {
    margin: 0 0 14px;
    color: #333;
}

.language-tool-chart {
    margin-bottom: 28px;
    padding: 18px;
    border: 1px solid #d5e0e8;
    border-radius: 14px;
    background: #f8fbfd;
}

.language-tool-chart h3 {
    margin: 0 0 14px;
    color: #333;
}

.language-tool-empty {
    margin: 0;
    color: #777;
}

.language-tool-list {
    display: grid;
    gap: 8px;
}

.language-tool-row {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) minmax(120px, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #fff;
}

.language-tool-row code {
    color: #155e87;
    overflow-wrap: anywhere;
}

.phrase-distractor-chart {
    margin-bottom: 28px;
    padding: 18px;
    border: 1px solid #f1dfbd;
    border-radius: 14px;
    background: #fffcf6;
}

.phrase-distractor-chart h3 {
    margin: 0 0 14px;
    color: #333;
}

.phrase-distractor-list {
    display: grid;
    gap: 8px;
}

.phrase-distractor-row {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) minmax(120px, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #fff;
}

.phrase-distractor-row code {
    color: #9a5c00;
    overflow-wrap: anywhere;
}

.sst-pie-layout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 24px;
}

.sst-pie {
    width: 190px;
    height: 190px;
    display: grid;
    place-items: center;
    border-radius: 50%;
}

.sst-pie-center {
    display: grid;
    place-items: center;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    background: #fff;
    color: #555;
    font-weight: bold;
    text-align: center;
    line-height: 1.3;
}

.sst-legend {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 220px;
}

.sst-legend-item {
    display: grid;
    grid-template-columns: 12px minmax(70px, 1fr) auto;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
}

.sst-legend-item strong {
    color: #777;
    font-weight: 600;
    white-space: nowrap;
}

.sst-swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
}

.sst-swatch.Omission { background: #1cb0f6; }
.sst-swatch.Addition { background: #ff9800; }
.sst-swatch.Misformation { background: #ff4b4b; }
.sst-swatch.Misordering { background: #9c27b0; }

.mindmap {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.mindmap-root {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 20px;
}

.root-node {
    background: #1cb0f6;
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: bold;
    font-size: 1.1rem;
    box-shadow: 0 4px 12px rgba(28, 176, 246, 0.3);
}

.root-line {
    width: 2px;
    height: 30px;
    background: #ccc;
    margin-top: 10px;
}

.mindmap-branches {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    position: relative;
    padding-left: 20px;
}

.mindmap-branches::before {
    content: '';
    position: absolute;
    left: 20px;
    top: -20px;
    bottom: 50%;
    width: 2px;
    background: #ccc;
}

.branch-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-left: 40px;
}

.branch-wrapper::before {
    content: '';
    position: absolute;
    left: 0;
    top: 24px;
    width: 40px;
    height: 2px;
    background: #ccc;
}

.branch-node {
    background: #f7f9fc;
    border: 2px solid #e5e5e5;
    padding: 12px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    max-width: 450px;
    position: relative;
    z-index: 1;
}

.branch-node:hover {
    border-color: #1cb0f6;
    background: #e6f7ff;
}

.branch-node.expanded {
    border-color: #1cb0f6;
    background: #e6f7ff;
    box-shadow: 0 4px 12px rgba(28, 176, 246, 0.1);
}

.node-name {
    font-weight: bold;
    color: #333;
    flex: 1;
}

.node-count {
    font-weight: bold;
    color: #ff4b4b;
    font-size: 1.1rem;
}

/* 展開的處方卡片 */
.prescription-card {
    background: #f0fff0;
    border: 2px solid #58cc02;
    border-radius: 12px;
    padding: 16px;
    margin-top: 12px;
    width: 100%;
    max-width: 450px;
    position: relative;
}

.prescription-card::before {
    content: '';
    position: absolute;
    left: -20px;
    top: 24px;
    width: 18px;
    height: 2px;
    background: #58cc02;
}

.prescription-header {
    font-weight: bold;
    color: #58cc02;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.advice-text {
    color: #333;
    line-height: 1.5;
    margin: 0 0 16px 0;
    font-size: 0.95rem;
}

/* 👇 新增：題目列表樣式 */
.question-list {
    background: white;
    border-radius: 8px;
    padding: 12px;
    border: 1px dashed #58cc02;
}

.question-list-title {
    font-size: 0.85rem;
    font-weight: bold;
    color: #777;
    margin-bottom: 8px;
}

.question-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    font-size: 0.9rem;
}

.question-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.q-text {
    color: #333;
    font-family: monospace;
}

.q-count {
    color: #ff4b4b;
    font-weight: bold;
    font-size: 0.85rem;
}

/* 動畫 */
.slide-enter-active,
.slide-leave-active {
    transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

@keyframes popIn {
    0% {
        transform: scale(0.9);
        opacity: 0;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}
</style>