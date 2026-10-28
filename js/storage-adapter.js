// ============================================
// js/storage-adapter.js — لایه‌ی واسط Supabase
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// توضیح: جایگزین شفاف برای Storage
// ============================================

(function () {
  'use strict';

  // اگه Supabase فعال نیست، خارج شو
  if (!window.WAM_CONFIG || !window.WAM_CONFIG.features.useSupabase) {
    console.warn('⚠️ Storage Adapter: Supabase disabled, using localStorage');
    return;
  }

  if (!window.WAM_SB) {
    console.error('❌ Storage Adapter: WAM_SB not loaded');
    return;
  }

  // ============================================
  // نقشه‌ی کلیدهای LocalStorage به جداول Supabase
  // ============================================
  const KEY_TO_TABLE = {
    'wamPayUsers':        { table: 'users',        idField: 'id' },
    'wamPayAdmins':       { table: 'admins',       idField: 'id' },
    'wamPayApplications': { table: 'applications', idField: 'id' },
    'wamPayConsultations':{ table: 'consultations',idField: 'id' },
    'wamPayReferrals':    { table: 'referrals',    idField: 'id' },
    'wamPayCommissions':  { table: 'commissions',  idField: 'id' },
    'wamPayQueues':       { table: 'queues',       idField: 'id' },
    'wamPayOTPs':         { table: 'otps',         idField: 'id' }
  };

  // ============================================
  // تشخیص نوع کلید
  // ============================================
  function getTableInfo(key) {
    return KEY_TO_TABLE[key] || null;
  }

  // ============================================
  // API اصلی — جایگزین Storage
  // ============================================
  const Adapter = {
    // ----------------
    // Get
    // ----------------
    async get(key, defaultValue) {
      const info = getTableInfo(key);
      
      // اگه کلید مربوط به جدول Supabase نیست، از LocalStorage بخون
      if (!info) {
        return window.Storage.get(key, defaultValue);
      }

      try {
        const { data, error } = await window.WAM_SB.client
          .from(info.table)
          .select('*');

        if (error) {
          console.error(`❌ Adapter.get(${key}):`, error.message);
          return defaultValue !== undefined ? defaultValue : null;
        }

        // نتیجه رو به صورت JSON string برگردون (سازگار با Storage.get)
        return JSON.stringify(data || []);
      } catch (e) {
        console.error(`❌ Adapter.get(${key}):`, e);
        return defaultValue !== undefined ? defaultValue : null;
      }
    },

    async getJSON(key, defaultValue) {
      const raw = await this.get(key, null);
      if (raw === null || raw === undefined) {
        return defaultValue !== undefined ? defaultValue : null;
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error(`❌ Adapter.getJSON(${key}):`, e);
        return defaultValue !== undefined ? defaultValue : null;
      }
    },

    // ----------------
    // Set
    // ----------------
    async set(key, value) {
      const info = getTableInfo(key);
      
      if (!info) {
        return window.Storage.set(key, value);
      }

      try {
        let items = [];
        try {
          items = JSON.parse(value);
        } catch (e) {
          console.error(`❌ Adapter.set(${key}): value is not valid JSON`);
          return false;
        }

        if (!Array.isArray(items)) {
          items = [items];
        }

        // استفاده از upsert برای درج یا آپدیت
        const { error } = await window.WAM_SB.client
          .from(info.table)
          .upsert(items, { onConflict: info.idField });

        if (error) {
          console.error(`❌ Adapter.set(${key}):`, error.message);
          return false;
        }

        // همچنین توی LocalStorage هم ذخیره کن (به عنوان cache)
        window.Storage.set(key, value);
        return true;
      } catch (e) {
        console.error(`❌ Adapter.set(${key}):`, e);
        return false;
      }
    },

    async setJSON(key, value) {
      return await this.set(key, JSON.stringify(value));
    },

    // ----------------
    // Remove
    // ----------------
    async remove(key) {
      const info = getTableInfo(key);
      
      if (!info) {
        return window.Storage.remove(key);
      }

      // برای حذف، کل جدول رو خالی نمی‌کنیم
      // فقط توی LocalStorage پاک می‌کنیم
      return window.Storage.remove(key);
    },

    // ----------------
    // Keys / Has
    // ----------------
    has(key) {
      return window.Storage.has(key);
    },

    keys(prefix) {
      return window.Storage.keys(prefix);
    },

    // ----------------
    // کمکی
    // ----------------
    getSize() {
      return window.Storage.getSize();
    },

    getInfo() {
      return window.Storage.getInfo();
    },

    clearAll() {
      return window.Storage.clearAll();
    },

    isAvailable() {
      return window.Storage.isAvailable();
    }
  };

  // ============================================
  // Export
  // ============================================
  window.StorageAdapter = Adapter;
  window.StorageASync = Adapter; // نام جایگزین

  console.log('✅ Storage Adapter v1.0.0 loaded — Ready to bridge LocalStorage ↔ Supabase');
})();