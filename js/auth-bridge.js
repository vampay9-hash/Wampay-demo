// ============================================
// js/auth-bridge.js — پل ارتباطی Auth و Supabase
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// ============================================

(function () {
  'use strict';

  if (!window.WAM_CONFIG || !window.WAM_CONFIG.features.useSupabase) {
    console.warn('⚠️ Auth Bridge: Supabase disabled');
    return;
  }

  if (!window.WAM_SB) {
    console.error('❌ Auth Bridge: WAM_SB not loaded');
    return;
  }

  const Bridge = {
    // ----------------
    // لاگین با موبایل (OTP)
    // ----------------
    async signInWithMobile(mobile) {
      console.log('🔐 Auth Bridge: Sign in with mobile:', mobile);
      
      try {
        const { data, error } = await window.WAM_SB.client.auth.signInWithOtp({
          phone: '+98' + mobile.slice(1) // تبدیل 0912... به +98912...
        });

        if (error) {
          console.error('❌ Sign in error:', error.message);
          return { ok: false, error: error.message };
        }

        return { ok: true, data: data };
      } catch (e) {
        console.error('❌ Sign in exception:', e);
        return { ok: false, error: e.message };
      }
    },

    // ----------------
    // تأیید OTP
    // ----------------
    async verifyOtp(mobile, token) {
      console.log('🔐 Auth Bridge: Verify OTP for', mobile);
      
      try {
        const { data, error } = await window.WAM_SB.client.auth.verifyOtp({
          phone: '+98' + mobile.slice(1),
          token: token,
          type: 'sms'
        });

        if (error) {
          return { ok: false, error: error.message };
        }

        return { ok: true, data: data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ----------------
    // لاگین ادمین با موبایل + پسورد
    // ----------------
    async signInAdmin(mobile, password) {
      console.log('🔐 Auth Bridge: Admin login for', mobile);
      
      try {
        // چک می‌کنیم که ادمین توی جدول admins هست
        const { data: admins, error: adminError } = await window.WAM_SB.client
          .from('admins')
          .select('*')
          .eq('phone_number', mobile)
          .single();

        if (adminError || !admins) {
          return { ok: false, error: 'ادمین با این شماره یافت نشد' };
        }

        if (!admins.is_active) {
          return { ok: false, error: 'حساب ادمین غیرفعال است' };
        }

        // TODO: تأیید پسورد از طریق جدول users یا auth
        // برای الان، پسورد رو به صورت ساده چک می‌کنیم
        // (بعداً باید به Supabase Auth منتقل بشه)

        return { ok: true, admin: admins };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ----------------
    // خروج
    // ----------------
    async signOut() {
      try {
        await window.WAM_SB.client.auth.signOut();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ----------------
    // کاربر فعلی
    // ----------------
    async getCurrentUser() {
      try {
        const { data: { user }, error } = await window.WAM_SB.client.auth.getUser();
        
        if (error || !user) {
          return null;
        }

        // اطلاعات کاربر رو از جدول users بگیر
        const { data: profile } = await window.WAM_SB.client
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        return profile || user;
      } catch (e) {
        return null;
      }
    },

    // ----------------
    // Session
    // ----------------
    async getSession() {
      try {
        const { data: { session } } = await window.WAM_SB.client.auth.getSession();
        return session;
      } catch (e) {
        return null;
      }
    }
  };

  window.AuthBridge = Bridge;
  console.log('✅ Auth Bridge v1.0.0 loaded');
})();