import { ref, Ref } from 'vue';
import { supabase } from '../services/supabaseClient';
import { CloudDatabase } from '../services/CloudDatabase';

export function useAdminAuth() {
  const currentTeacherId = ref<string>('');
  const isAdminAuthenticated = ref(sessionStorage.getItem('admin_auth') === 'true');
  const adminEmailInput = ref('');
  const adminPasswordInput = ref('');
  const showAdminAuth = ref(false);
  const pendingAction = ref<'admin' | 'analytics' | null>(null);
  const isVerifying = ref(false);

  // 暫存登入成功後需要打開的視窗 Ref
  let pendingShowRef: Ref<boolean> | null = null;

  const verifyAdmin = async () => {
    if (isVerifying.value) return;
    isVerifying.value = true;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmailInput.value,
        password: adminPasswordInput.value,
      });
      if (error) throw error;

      if (data.user) {
        currentTeacherId.value = data.user.id;
        sessionStorage.setItem('teacher_id', data.user.id);
      }
      isAdminAuthenticated.value = true;
      sessionStorage.setItem('admin_auth', 'true');
      showAdminAuth.value = false;
      adminEmailInput.value = '';
      adminPasswordInput.value = '';

      void CloudDatabase.warmLanguageTool();

      // 修正：登入成功後，執行剛才被攔截的動作（打開後台）
      if (pendingShowRef) {
        pendingShowRef.value = true;
        pendingShowRef = null;
      }
      pendingAction.value = null;

    } catch (error: any) {
      // 修正：印出詳細錯誤，方便除錯 400 錯誤
      console.error('Supabase 登入失敗:', error);
      alert(`登入失敗！原因：${error.message || '請檢查 Email 與密碼'}`);
      adminPasswordInput.value = '';
    } finally {
      isVerifying.value = false;
    }
  };

  const logoutAdmin = () => {
    if (confirm('確定要登出教師模式嗎？')) {
      isAdminAuthenticated.value = false;
      sessionStorage.removeItem('admin_auth');
      sessionStorage.removeItem('teacher_id');
    }
  };

  const cancelAuth = () => {
    showAdminAuth.value = false;
    adminPasswordInput.value = '';
    pendingAction.value = null;
    pendingShowRef = null;
  };

  const openAdmin = (showAdminRef: Ref<boolean>, setPending: (v: 'admin' | 'analytics' | null) => void) => {
    if (isAdminAuthenticated.value) {
      showAdminRef.value = true;
    } else {
      pendingShowRef = showAdminRef; // 記住這個 Ref
      setPending('admin');
      showAdminAuth.value = true;
    }
  };

  const openAnalytics = (showAnalyticsRef: Ref<boolean>, setPending: (v: 'admin' | 'analytics' | null) => void) => {
    if (isAdminAuthenticated.value) {
      showAnalyticsRef.value = true;
    } else {
      pendingShowRef = showAnalyticsRef; // 記住這個 Ref
      setPending('analytics');
      showAdminAuth.value = true;
    }
  };

  return {
    currentTeacherId,
    isAdminAuthenticated,
    adminEmailInput,
    adminPasswordInput,
    showAdminAuth,
    pendingAction,
    isVerifying,
    verifyAdmin,
    logoutAdmin,
    cancelAuth,
    openAdmin,
    openAnalytics,
  };
}