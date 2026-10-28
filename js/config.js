// ============================================
// js/config.js — تنظیمات Supabase
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// ============================================

(function () {
  'use strict';

  window.WAM_CONFIG = {
    supabase: {
      url: 'http://62.60.191.179:8000',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxMzU0NjE5LCJleHAiOjE5NDkwMzQ2MTl9.I6Wc_3L-qpjz81Rp53FOqyjjy45pV4WW-iC3ebFauwo'
    },
    app: {
      name: 'WAM PAY',
      version: '2.0.0',
      environment: 'development' // development | production
    },
    features: {
      useSupabase: true,      // فلگ برای فعال/غیرفعال کردن Supabase
      useLocalStorage: false  // فلگ برای حالت fallback
    }
  };

  console.log('✅ WAM_CONFIG loaded:', window.WAM_CONFIG.app.version);
})();