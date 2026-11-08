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
  const isRegisterMode = ref(false); // 新增：切換登入/註冊模式

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
      isRegisterMode.value = false; // 登入成功後重置模式

      void CloudDatabase.warmLanguageTool();

      if (pendingShowRef) {
        pendingShowRef.value = true;
        pendingShowRef = null;
      }
      pendingAction.value = null;

    } catch (error: any) {
      console.error('Supabase 登入失敗:', error);
      alert(`登入失敗！原因：${error.message || '請檢查 Email 與密碼'}`);
      adminPasswordInput.value = '';
    } finally {
      isVerifying.value = false;
    }
  };

  // 新增：註冊函數
  const registerAdmin = async () => {
    if (isVerifying.value) return;
    isVerifying.value = true;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: adminEmailInput.value,
        password: adminPasswordInput.value,
      });
      if (error) throw error;

      // 註冊成功（Supabase 預設會寄送驗證信，或者直接登入）
      if (data.session) {
        // 如果 Supabase 關閉了信箱驗證，會直接回傳 session，可以直接登入
        currentTeacherId.value = data.user!.id;
        sessionStorage.setItem('teacher_id', data.user!.id);
        isAdminAuthenticated.value = true;
        sessionStorage.setItem('admin_auth', 'true');
        showAdminAuth.value = false;
        alert('註冊並登入成功！');
        if (pendingShowRef) {
          pendingShowRef.value = true;
          pendingShowRef = null;
        }
      } else {
        // 如果 Supabase 開啟了信箱驗證，需要使用者去收信
        alert('註冊成功！請至您的信箱點擊驗證連結，驗證完成後再回來登入。');
        isRegisterMode.value = false; // 切回登入模式
      }

      adminEmailInput.value = '';
      adminPasswordInput.value = '';
      pendingAction.value = null;

    } catch (error: any) {
      console.error('Supabase 註冊失敗:', error);
      alert(`註冊失敗！原因：${error.message || '請檢查 Email 格式或密碼強度'}`);
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
    isRegisterMode.value = false; // 取消時重置模式
  };

  const openAdmin = (showAdminRef: Ref<boolean>, setPending: (v: 'admin' | 'analytics' | null) => void) => {
    if (isAdminAuthenticated.value) {
      showAdminRef.value = true;
    } else {
      pendingShowRef = showAdminRef;
      setPending('admin');
      showAdminAuth.value = true;
    }
  };

  const openAnalytics = (showAnalyticsRef: Ref<boolean>, setPending: (v: 'admin' | 'analytics' | null) => void) => {
    if (isAdminAuthenticated.value) {
      showAnalyticsRef.value = true;
    } else {
      pendingShowRef = showAnalyticsRef;
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
    isRegisterMode, // 記得 return
    verifyAdmin,
    registerAdmin,  // 記得 return
    logoutAdmin,
    cancelAuth,
    openAdmin,
    openAnalytics,
  };
}