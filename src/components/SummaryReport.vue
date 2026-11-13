<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import html2canvas from 'html2canvas';

const props = defineProps<{
  completedLevels: number;
  totalLevels: number;
  misconceptions: string[];
}>();

console.log('🚨 [Trace-6: SummaryReport 收到迷思列表]', props.misconceptions);

const emit = defineEmits<{
  (e: 'restart'): void;
}>();

const reportCardRef = ref<HTMLElement | null>(null);
const isGenerating = ref(false);
const isDownloaded = ref(false);
let beforeunloadHandler: null | EventListener = null;

const misconceptionText = computed(() => {
  const dict: Record<string, string> = {
    'DUPLICATE_PRONOUN': '重複代名詞 (例如：who she)',
    'SV_AGREEMENT': '主詞動詞不一致 (例如：who wear)'
  };
  return props.misconceptions.map(m => dict[m] || m);
});

const downloadScreenshot = async () => {
  if (!reportCardRef.value) return;
  isGenerating.value = true;
  
  try {
    // 使用 html2canvas 將 DOM 轉換為圖片
    const canvas = await html2canvas(reportCardRef.value, {
      backgroundColor: '#ffffff', // 確保背景是白色的
      scale: 2, // 提高解析度，讓圖片在手機上也很清晰
      useCORS: true,
    });
    
    // 將 Canvas 轉為圖片並觸發下載
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `SyntaxHunter_學習紀錄_${new Date().getTime()}.png`;
    link.click();
  } catch (err) {
    console.error('截圖失敗:', err);
    alert('產生圖片失敗，請直接使用設備的截圖功能。');
  } finally {
    isGenerating.value = false;
  }
};
const autoDownloadAndRegister = async () => {
  if (isGenerating.value) return;
  isGenerating.value = true;
  try {
    if (!reportCardRef.value) return;
    const canvas = await html2canvas(reportCardRef.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `AnimeHunter_學習紀錄_${new Date().getTime()}.png`;
    link.click();
    isDownloaded.value = true;
    registerBeforeUnload();
  } catch (err) {
    console.error('截圖失敗:', err);
  } finally {
    isGenerating.value = false;
  }
};

const registerBeforeUnload = () => {
  if (beforeunloadHandler) return;
  const handler = (e: any) => {
    if (!isDownloaded.value) {
      e.preventDefault();
      e.returnValue = '你有未下載的學習紀錄，確定要離開嗎？';
    }
  };
  window.addEventListener('beforeunload', handler);
  beforeunloadHandler = handler;
};

const removeBeforeUnload = () => {
  if (beforeunloadHandler) {
    window.removeEventListener('beforeunload', beforeunloadHandler);
    beforeunloadHandler = null;
  }
};

const saveAndExit = () => {
  isDownloaded.value = true;
  removeBeforeUnload();
  emit('restart');
};

onMounted(() => {
  autoDownloadAndRegister();
});

onBeforeUnmount(() => {
  removeBeforeUnload();
});
</script>

<template>
  <div class="summary-overlay">
    <!-- 這個 div 包住的就是要截圖的範圍 -->
    <div class="summary-card" ref="reportCardRef">
      <!-- 適合截圖的頂部標題 -->
      <div class="header">
        <div class="badge">🕵️ 英語文法小偵探</div>
        <h2>任務完成！</h2>
        <p>恭喜你完成了 {{ completedLevels }} / {{ totalLevels }} 個關卡。</p>
      </div>

      <!-- 學習軌跡紀錄 -->
      <div class="stats-section">
        <h3>🔍 我的學習軌跡</h3>
        <ul v-if="misconceptionText.length > 0" class="misconception-list">
          <li v-for="(text, i) in misconceptionText" :key="i">
            <span class="icon">💡</span> 成功破解迷思：{{ text }}
          </li>
        </ul>
        <p v-else class="perfect-text">✨ 太完美了！沒有觸發任何文法迷思。</p>
      </div>
      
      <!-- 卡片底部的水印 -->
      <div class="watermark">
        Anime Character Hunter Lite
      </div>
    </div>

    <!-- 按鈕區 (放在卡片外面，這樣截圖時不會被拍到) -->
    <div class="actions">
      <button class="btn-download" @click="downloadScreenshot" :disabled="isGenerating">
        <span v-if="isGenerating">⏳ 正在生成圖片...</span>
        <span v-else>📸 下載學習紀錄 (傳給老師)</span>
      </button>
      
      <button class="btn-restart" @click="emit('restart')" :disabled="isGenerating">
        🔄 重新開始練習
      </button>
    </div>
  </div>
</template>

<style scoped>
.summary-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
  padding: 20px;
}

/* 報告卡片本身 */
.summary-card {
  background: white;
  width: 100%;
  max-width: 480px;
  border-radius: 24px;
  padding: 40px 32px;
  text-align: center;
  box-shadow: 0 24px 48px rgba(0,0,0,0.3);
  border: 4px solid #58cc02;
  position: relative;
  overflow: hidden;
}

.header .badge {
  display: inline-block;
  background: #e6f7ff;
  color: #1cb0f6;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: bold;
  margin-bottom: 12px;
}

.header h2 { color: #58cc02; font-size: 2.2rem; margin: 0 0 8px 0; }
.header p { color: #777; margin-bottom: 24px; font-size: 1.1rem; }

.stats-section {
  background: #f9f9f9;
  border-radius: 16px;
  padding: 24px;
  text-align: left;
  margin-bottom: 20px;
}
.stats-section h3 { margin: 0 0 16px 0; color: #333; font-size: 1.2rem; text-align: center;}

.misconception-list {
  list-style: none;
  padding: 0; margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.misconception-list li {
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  border-left: 4px solid #ff9800;
  color: #555;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.icon { margin-right: 8px; }
.perfect-text { color: #58cc02; font-weight: bold; margin: 0; text-align: center; font-size: 1.1rem;}

.watermark {
  font-size: 0.75rem;
  color: #ccc;
  margin-top: 10px;
  font-weight: bold;
  letter-spacing: 1px;
}

/* 按鈕區 */
.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  margin-top: 20px;
}

.btn-download {
  background: #1cb0f6; color: white; border: none; border-bottom: 5px solid #1899d6;
  padding: 16px; border-radius: 16px; font-weight: bold; font-size: 1.1rem; cursor: pointer;
  transition: all 0.1s;
}
.btn-download:active { border-bottom-width: 0; transform: translateY(5px); }
.btn-download:disabled { opacity: 0.7; cursor: not-allowed; }

.btn-restart {
  background: rgba(255, 255, 255, 0.2); color: white; border: 2px solid white;
  padding: 16px; border-radius: 16px; font-weight: bold; font-size: 1.1rem; cursor: pointer;
  transition: all 0.1s;
}
.btn-restart:hover { background: rgba(255, 255, 255, 0.3); }
</style>