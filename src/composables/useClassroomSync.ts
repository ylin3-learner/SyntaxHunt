import { supabase } from '../services/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

let channel: RealtimeChannel | null = null;
let reportSyncError: ((message: string) => void) | null = null;

export function useClassroomSync() {
    const joinRoom = (onReceive: (event: string, payload: any) => void, studentId: string = 'anonymous') => {
        reportSyncError = (message) => onReceive('SYNC_ERROR', { message });
        if (channel) {
            supabase.removeChannel(channel);
            channel = null;
        }

        // 使用固定的頻道名稱
        const channelName = 'classroom_sync_main'; 

        channel = supabase.channel(channelName, {
            config: { presence: { key: studentId } },
        })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classroom_state' }, (payload) => {
                const newState = payload.new;
                onReceive('SYNC_STATE', {
                    id: newState.current_question_id,
                    timerEndTime: newState.timer_end_time,
                    isClassMode: newState.is_class_mode,
                    targetCount: newState.target_count
                });
            })
            // 新增：接收老師的重置廣播
            .on('broadcast', { event: 'RESET_PROGRESS' }, () => {
                onReceive('RESET_PROGRESS', {});
            })
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel?.presenceState() || {};
                const completedCount = Object.values(presenceState)
                    .flat()
                    .filter((p: any) => p.status === 'completed').length;
                onReceive('PRESENCE_SYNC', { completedCount });
            })
            .subscribe(async (status) => {
                console.log(`[Realtime] Channel status:`, status);
                onReceive('REALTIME_STATUS', { status });
                if (status === 'SUBSCRIBED') {
                    const activeChannel = channel;
                    if (!activeChannel) return;
                    try {
                        const trackStatus = await activeChannel.track({ status: 'answering' });
                        if (trackStatus !== 'ok') {
                            throw new Error(`Presence 更新失敗：${trackStatus}`);
                        }
                        const { data, error } = await supabase
                            .from('classroom_state')
                            .select('*')
                            .eq('id', 'current_state')
                            .single();
                        if (error) throw error;
                        if (data) {
                            onReceive('SYNC_STATE', {
                                id: data.current_question_id,
                                timerEndTime: data.timer_end_time,
                                isClassMode: data.is_class_mode,
                                targetCount: data.target_count
                            });
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.error('Realtime 同步初始化失敗:', error);
                        onReceive('SYNC_ERROR', { message });
                    }
                }
            });
    };

    const trackPresence = async (status: 'completed' | 'answering') => {
        if (!channel) return;
        try {
            const result = await channel.track({ status });
            if (result !== 'ok') throw new Error(`Presence 更新失敗：${result}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Realtime Presence 更新失敗:', error);
            reportSyncError?.(message);
        }
    };

    const trackCompleted = () => trackPresence('completed');
    const trackAnswering = () => trackPresence('answering');

    // 新增：老師廣播重置全班進度
    const sendResetProgress = () => {
        if (channel) {
            channel.send({ type: 'broadcast', event: 'RESET_PROGRESS' });
        }
    };

    const sendPush = async (q: any, endTime: number | null, password: string) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/functions/v1/teacher-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, action: 'PUSH_QUESTION', payload: { questionId: q.id, timerEndTime: endTime } })
        });
    };

    const sendAddTime = async (newEndTime: number, password: string) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/functions/v1/teacher-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, action: 'ADD_TIME', payload: { newEndTime } })
        });
    };

    const updateClassMode = async (isClassMode: boolean, targetCount: number, password: string) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/functions/v1/teacher-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password, action: 'UPDATE_SETTINGS', payload: { isClassMode, targetCount }
            })
        });
    };

    const leaveRoom = () => {
        if (channel) { supabase.removeChannel(channel); channel = null; }
        reportSyncError = null;
    };

    return { joinRoom, trackCompleted, trackAnswering, sendResetProgress, sendPush, sendAddTime, updateClassMode, leaveRoom };
}