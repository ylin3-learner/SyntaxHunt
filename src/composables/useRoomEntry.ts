import { ref, Ref } from 'vue';
import { useClassroomSync } from './useClassroomSync';

export function useRoomEntry() {
  const roomCodeInput = ref('');
  const joinError = ref('');
  const isJoining = ref(false);
  const showRoomEntry = ref(false);

  const { findTeacherByRoomCode, joinRoom } = useClassroomSync();

  const handleJoinRoom = async (
    code: string,
    currentTeacherIdRef: Ref<string>,
    studentId: string,
    handleRealtimeEvent: (event: string, payload: any) => void
  ) => {
    if (!code.trim()) return;
    isJoining.value = true;
    joinError.value = '';
    const teacherId = await findTeacherByRoomCode(code.trim());
    if (teacherId) {
      currentTeacherIdRef.value = teacherId;
      sessionStorage.setItem('teacher_id', teacherId);
      sessionStorage.setItem('room_code', code.trim().toUpperCase());
      joinRoom(handleRealtimeEvent, teacherId, studentId);
      window.location.reload();
    } else {
      joinError.value = '找不到該班級代碼，請確認後重新輸入。';
    }
    isJoining.value = false;
  };

  return {
    roomCodeInput,
    joinError,
    isJoining,
    showRoomEntry,
    handleJoinRoom,
  };
}
