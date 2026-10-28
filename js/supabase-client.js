// ============================================
// js/supabase-client.js — کلاینت مرکزی Supabase
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// توضیح: این فایل ارتباط با Supabase رو مدیریت می‌کنه
// ============================================

(function () {
  'use strict';

  // اگه Supabase فعال نباشه، خارج شو
  if (!window.WAM_CONFIG || !window.WAM_CONFIG.features.useSupabase) {
    console.warn('⚠️ Supabase disabled');
    return;
  }

  // چک کردن بارگذاری کتابخانه Supabase
  if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded. Add CDN to HTML.');
    return;
  }

  // ساخت کلاینت Supabase
  const { createClient } = window.supabase;
  const client = createClient(
    window.WAM_CONFIG.supabase.url,
    window.WAM_CONFIG.supabase.anonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'wampay-auth'
      }
    }
  );

  // ============================================
  // API مرکزی
  // ============================================
  window.WAM_SB = {
    client: client,

    // ========== Auth ==========
    auth: {
      // ثبت‌نام با ایمیل/پسورد
      signUp: async (email, password, metadata = {}) => {
        return await client.auth.signUp({
          email,
          password,
          options: { data: metadata }
        });
      },

      // ورود با ایمیل/پسورد
      signIn: async (email, password) => {
        return await client.auth.signInWithPassword({ email, password });
      },

      // ورود با OTP (پیامک)
      signInWithOtp: async (phone) => {
        return await client.auth.signInWithOtp({ phone });
      },

      // تأیید OTP
      verifyOtp: async (phone, token) => {
        return await client.auth.verifyOtp({
          phone,
          token,
          type: 'sms'
        });
      },

      // خروج
      signOut: async () => {
        return await client.auth.signOut();
      },

      // گرفتن کاربر فعلی
      getUser: async () => {
        const { data: { user } } = await client.auth.getUser();
        return user;
      },

      // گرفتن session فعلی
      getSession: async () => {
        const { data: { session } } = await client.auth.getSession();
        return session;
      }
    },

    // ========== Database ==========
    db: {
      from: (table) => client.from(table),

      // خواندن با فیلتر
      select: async (table, filter = {}) => {
        let query = client.from(table).select('*');
        Object.keys(filter).forEach(key => {
          query = query.eq(key, filter[key]);
        });
        return await query;
      },

      // درج
      insert: async (table, data) => {
        return await client.from(table).insert(data).select();
      },

      // آپدیت
      update: async (table, id, data) => {
        return await client.from(table).update(data).eq('id', id).select();
      },

      // حذف
      delete: async (table, id) => {
        return await client.from(table).delete().eq('id', id);
      }
    },

    // ========== Storage ==========
    storage: {
      // آپلود فایل
      upload: async (bucket, path, file) => {
        return await client.storage.from(bucket).upload(path, file);
      },

      // دانلود فایل
      download: async (bucket, path) => {
        return await client.storage.from(bucket).download(path);
      },

      // لینک عمومی
      getPublicUrl: (bucket, path) => {
        return client.storage.from(bucket).getPublicUrl(path);
      }
    },

    // ========== Realtime ==========
    realtime: {
      channel: (name) => client.channel(name)
    }
  };

  console.log('✅ WAM_SB (Supabase Client) initialized');
})();