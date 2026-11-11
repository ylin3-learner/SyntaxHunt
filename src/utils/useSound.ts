// 只有一個 AudioContext 實例
let audioCtx: AudioContext | null = null;

/**
 * 唯一負責建立與解鎖 AudioContext 的函數
 * 必須確保這個函數是在「同步」的使用者點擊事件（如 pointerdown）中被呼叫
 */
export const unlockAudioContext = () => {
    // 如果已經建立過，直接跳過
    if (audioCtx) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        // 1. 在同步事件中建立實例
        audioCtx = new AudioContextClass();

        // 2. 在同步事件中立刻請求恢復
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                console.log('🔓 Web Audio API unlocked successfully');
            }).catch(e => {
                console.warn('Audio unlock failed', e);
            });
        } else {
            console.log('🔓 Web Audio API already running');
        }
    } catch (e) {
        console.warn('Web Audio API not supported', e);
    }
};

// 核心播放函式
const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume = 0.2) => {
    // 終極防護：如果沒有實例，或者狀態不是 running，直接靜默返回
    // 絕對不要去嘗試 await ctx.resume()，這會引發瀏覽器警告
    if (!audioCtx || audioCtx.state !== 'running') return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
};

export function useSound() {
    // 🎵 過關音效
    const playSuccess = () => {
        if (!audioCtx || audioCtx.state !== 'running') return;

        const now = audioCtx.currentTime + 0.05;
        const notes = [523.25, 659.25, 783.99, 1046.50];

        notes.forEach((freq, index) => {
            playTone(freq, now + index * 0.1, 0.4, 'sine', 0.2);
        });
    };

    // ❌ 錯誤音效
    const playError = () => {
        if (!audioCtx || audioCtx.state !== 'running') return;

        const now = audioCtx.currentTime + 0.05;
        playTone(392.00, now, 0.15, 'triangle', 0.15);
        playTone(311.13, now + 0.15, 0.3, 'triangle', 0.15);
    };

    // 🚨 防切屏警告音
    const playWarningBeep = () => {
        if (!audioCtx || audioCtx.state !== 'running') return;

        const now = audioCtx.currentTime;

        const playBeep = (startTime: number) => {
            const osc = audioCtx!.createOscillator();
            const gain = audioCtx!.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
            gain.gain.setValueAtTime(0.15, startTime + 0.07);
            gain.gain.linearRampToValueAtTime(0, startTime + 0.08);

            osc.connect(gain);
            gain.connect(audioCtx!.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.08);
        };

        playBeep(now);
        playBeep(now + 0.15);
        playBeep(now + 0.30);
    };

    return { playSuccess, playError, playWarningBeep };
}