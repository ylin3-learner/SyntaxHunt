import { ref } from 'vue';

let isTTSUnlocked = false;
let globalVoices: SpeechSynthesisVoice[] = [];
let currentAudio: HTMLAudioElement | null = null;

const DEEPGRAM_VOICES = [
  'aura-2-thalia-en',    // 女聲，清晰活潑
  'aura-2-arcas-en',     // 男聲，自然流暢
  'aura-2-helena-en',    // 女聲，親切溫柔
  'aura-2-apollo-en'     // 男聲，自信沉穩
];

const loadVoices = () => {
  if ('speechSynthesis' in window) {
    globalVoices = window.speechSynthesis.getVoices();
  }
};

if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export const unlockTTS = () => {
  if (isTTSUnlocked) return;
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }
  isTTSUnlocked = true;
};

export function useTTS() {
  const isSpeaking = ref(false);

  const speak = async (text: string, options?: { rate?: number }) => {
    // 調整預設語速，較慢的語速能有效減少連讀
    const rate = options?.rate ?? 0.75;
    const forceCloudTTS = window.location.search.includes('forceTTS=1') || window.location.search.includes('forceEdge=1');

    // 過濾出英文語音
    const enVoices = globalVoices.filter(v => v.lang.toLowerCase().includes('en'));

    // 智慧挑選最佳語音
    let bestVoice = null;
    if (enVoices.length > 0) {
      // 1. 優先尋找 Google US English (Chrome 上最自然)
      bestVoice = enVoices.find(v => v.name.includes('Google US English'));
      // 2. 其次尋找微軟的自然語音 (Edge)
      if (!bestVoice) bestVoice = enVoices.find(v => v.name.includes('Natural') && v.lang.includes('US'));
      // 3. 再次尋找 Apple 的 Samantha (Mac/iOS)
      if (!bestVoice) bestVoice = enVoices.find(v => v.name.includes('Samantha'));
      // 4. 如果都沒有，就選第一個英文語音
      if (!bestVoice) bestVoice = enVoices[0];
    }

    if (bestVoice && !forceCloudTTS) {
      console.log(`[TTS] 使用最佳系統語音: ${bestVoice.name}`);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = rate;
      utterance.voice = bestVoice;

      // 在標點符號後加入額外延遲，強制斷句 (可選，視情況開啟)
      // utterance.text = text.replace(/,/g, ', ');

      utterance.onstart = () => { isSpeaking.value = true; };
      utterance.onend = () => { isSpeaking.value = false; };
      window.speechSynthesis.speak(utterance);
    } else {
      if (forceCloudTTS) {
        console.log('[TTS] 🚨 強制走 Deepgram TTS...');
      } else {
        console.log('[TTS] 系統無語音包，呼叫 Deepgram TTS...');
      }

      isSpeaking.value = true;

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        // Deepgram 固定用第一個女聲，避免頻繁切換
        const selectedVoice = DEEPGRAM_VOICES[0];
        const deepgramSpeed = Math.max(0.7, Math.min(1.5, rate));

        const res = await fetch(`${supabaseUrl}/functions/v1/deepgram-tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: selectedVoice,
            speed: deepgramSpeed
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const audioBuffer = await res.arrayBuffer();
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);

        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(audioUrl);

        currentAudio.onended = () => {
          isSpeaking.value = false;
          URL.revokeObjectURL(audioUrl);
        };
        currentAudio.onerror = () => {
          isSpeaking.value = false;
          console.error('[TTS] 音檔播放失敗');
        };

        await currentAudio.play();
      } catch (error: any) {
        console.error(`[TTS] Deepgram TTS 失敗: ${error.message || error}`);
        isSpeaking.value = false;
      }
    }
  };

  return { speak, isSpeaking };
}

// ... 保留原本的 useSpeechRecognition ...
export function useSpeechRecognition() {
  const isListening = ref(false);
  const transcript = ref('');
  const isSupported = ref(false);
  const error = ref('');
  let recognition: any = null;
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (SpeechRecognition) {
    isSupported.value = true;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
  }

  const startListening = (targetText: string): Promise<{ match: boolean; text: string }> => {
    return new Promise((resolve) => {
      if (!recognition) { resolve({ match: false, text: '瀏覽器不支援' }); return; }
      transcript.value = ''; error.value = ''; isListening.value = true;
      recognition.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        transcript.value = resultText; isListening.value = false;
        const cleanTarget = targetText.toLowerCase().replace(/[.,?!|]/g, '').split(/\s+/).filter(Boolean);
        const cleanResult = resultText.toLowerCase().replace(/[.,?!|]/g, '').split(/\s+/).filter(Boolean);
        let matchCount = 0;
        cleanTarget.forEach((word: string) => { if (cleanResult.includes(word)) matchCount++; });
        resolve({ match: (matchCount / cleanTarget.length) >= 0.7, text: resultText });
      };
      recognition.onerror = (event: any) => {
        isListening.value = false; resolve({ match: false, text: `[錯誤: ${event.error}]` });
      };
      recognition.onend = () => { isListening.value = false; };
      try { recognition.start(); } catch (e: any) { resolve({ match: false, text: `[啟動失敗]` }); }
    });
  };
  return { isListening, transcript, isSupported, error, startListening };
}