import { supabase } from '../services/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

let channel: RealtimeChannel | null = null;
let reportSyncError: ((message: string) => void) | null = null;

export function useClassroomSync() {
    // @joinRoom 開始：加入課室即時頻道，頻道由 teacherId 隔離
    const joinRoom = (
        onReceive: (event: string, payload: any) => void,
        teacherId: string,
        studentId: string = 'anonymous'
    ) => {
        reportSyncError = (message) => onReceive('SYNC_ERROR', { message });
        if (channel) {
            supabase.removeChannel(channel);
            channel = null;
        }

        // 頻道名稱依教師 ID 隔離，避免不同班級串頻道
        const channelName = `classroom_sync_${teacherId}`;

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
            // 取得所有學生的狀態（包含座號）
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel?.presenceState() || {};
                const students = Object.entries(presenceState).flatMap(([key, presences]) =>
                    presences.map((p: any) => ({
                        id: key,
                        status: p.status,
                        seatCode: p.seatCode || '未分配'
                    }))
                );
                const completedCount = students.filter(s => s.status === 'completed').length;
                onReceive('PRESENCE_SYNC', { completedCount, students });
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
                            .eq('teacher_id', teacherId) // 使用傳入的 teacherId
                            .maybeSingle();              // 使用 maybeSingle 避免 0 rows 錯誤
                        if (error) {
                            throw error;
                        }
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
    // @joinRoom 結束

    // @trackPresence 開始：更新自身在線狀態，並可攜帶 seatCode
    const trackPresence = async (status: 'completed' | 'answering', seatCode?: string) => {
        if (!channel) return;
        try {
            const payload: any = { status };
            if (seatCode) payload.seatCode = seatCode;
            const result = await channel.track(payload);
            if (result !== 'ok') throw new Error(`Presence 更新失敗：${result}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Realtime Presence 更新失敗:', error);
            reportSyncError?.(message);
        }
    };

    // @trackCompleted 開始：標記學生完成作答，攜帶 seatCode
    const trackCompleted = (seatCode?: string) => trackPresence('completed', seatCode);
    // @trackCompleted 結束

    // @trackAnswering 開始：標記學生正在作答，攜帶 seatCode
    const trackAnswering = (seatCode?: string) => trackPresence('answering', seatCode);
    // @trackAnswering 結束

    // 新增：老師廣播重置全班進度
    const sendResetProgress = () => {
        if (channel) {
            channel.send({ type: 'broadcast', event: 'RESET_PROGRESS' });
        }
    };

    const sendPush = async (q: any, endTime: number | null) => {
        const { data } = await supabase.functions.invoke('teacher-action', {
            body: { action: 'PUSH_QUESTION', payload: { questionId: q.id, timerEndTime: endTime } }
        });
        return data?.roomCode;
    };

    const sendAddTime = async (newEndTime: number) => {
        await supabase.functions.invoke('teacher-action', {
            body: { action: 'ADD_TIME', payload: { newEndTime } }
        });
    };

    const updateClassMode = async (isClassMode: boolean, targetCount: number) => {
        const { data } = await supabase.functions.invoke('teacher-action', {
            body: { action: 'UPDATE_SETTINGS', payload: { isClassMode, targetCount } }
        });
        return data?.roomCode;
    };

    const findTeacherByRoomCode = async (code: string) => {
        try {
            const { data, error } = await supabase
                .from('classroom_state')
                .select('teacher_id')
                .eq('room_code', code.toUpperCase())
                .maybeSingle();

            if (error || !data) return null;
            return data.teacher_id;
        } catch (err) {
            return null;
        }
    };

    const leaveRoom = () => {
        if (channel) { supabase.removeChannel(channel); channel = null; }
        reportSyncError = null;
    };

    return { joinRoom, trackCompleted, trackAnswering, sendResetProgress, sendPush, sendAddTime, updateClassMode, leaveRoom, findTeacherByRoomCode };
}