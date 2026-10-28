// ============================================
// js/seed-demo.js — Seed کامل دمو
// نسخه: 1.0.0
// تاریخ: 1405/07/18
// توضیح: ساخت ۵ متقاضی + ۵ کارگزار + ۷ ادمین
// ============================================

(function () {
  'use strict';

  if (!window.WAM_SB) {
    console.error('❌ Seed Demo: WAM_SB not loaded');
    return;
  }

  // ═══════════════════════════════════════
  // داده‌های Seed
  // ═══════════════════════════════════════

  const SEED_DATA = {
    // 🏛️ ۷ ادمین
    admins: [
      {
        mobile: '09165370446',
        password: 'Wampay@2026',
        fullName: 'مصطفی پاکذاتی',
        email: 'pakzati@wampay.local',
        role: 'super_admin'
      },
      {
        mobile: '09193789402',
        password: 'Wampay@2026',
        fullName: 'محسن امیری',
        email: 'amiri@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09123333333',
        password: 'Wampay@2026',
        fullName: 'خانم صادقی',
        email: 'sadeghi@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09124444444',
        password: 'Wampay@2026',
        fullName: 'آقای رضایی',
        email: 'rezaei@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09125555555',
        password: 'Wampay@2026',
        fullName: 'خانم موسوی',
        email: 'mousavi@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09126666666',
        password: 'Wampay@2026',
        fullName: 'آقای کریمی',
        email: 'karimi@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09127777777',
        password: 'Wampay@2026',
        fullName: 'آقای نوری',
        email: 'nouri@wampay.local',
        role: 'admin'
      }
    ],

    // 👤 ۵ متقاضی
    applicants: [
      { mobile: '09141111111', fullName: 'رضا محمدی', nationalCode: '1234567891' },
      { mobile: '09142222222', fullName: 'سارا احمدی', nationalCode: '1234567892' },
      { mobile: '09143333333', fullName: 'علی رضایی', nationalCode: '1234567893' },
      { mobile: '09144444444', fullName: 'مریم کریمی', nationalCode: '1234567894' },
      { mobile: '09145555555', fullName: 'حسین نوری', nationalCode: '1234567895' }
    ],

    // 🤝 ۵ کارگزار
    brokers: [
      { mobile: '09351111111', fullName: 'محمد صادقی', nationalCode: '2234567891' },
      { mobile: '09352222222', fullName: 'فاطمه موسوی', nationalCode: '2234567892' },
      { mobile: '09353333333', fullName: 'حسن رحیمی', nationalCode: '2234567893' },
      { mobile: '09354444444', fullName: 'زهرا کریمی', nationalCode: '2234567894' },
      { mobile: '09355555555', fullName: 'امیر حسینی', nationalCode: '2234567895' }
    ]
  };

  // ═══════════════════════════════════════
  // ابزار
  // ═══════════════════════════════════════
  function log(msg) { console.log(`[SeedDemo] ${msg}`); }
  function logSuccess(msg) { console.log(`[SeedDemo] ✅ ${msg}`); }
  function logError(msg, err) { console.error(`[SeedDemo] ❌ ${msg}`, err); }

  function mobileToEmail(mobile) {
    return `${mobile}@wampay.local`;
  }

  // ═══════════════════════════════════════
  // ساخت کاربر در Supabase Auth
  // ═══════════════════════════════════════
  async function createAuthUser(mobile, password, metadata) {
    const email = mobileToEmail(mobile);

    const { data, error } = await window.WAM_SB.client.auth.signUp({
      email: email,
      password: password,
      options: { data: metadata }
    });

    if (error) {
      if (error.message.includes('already')) {
        // کاربر قبلاً هست، signIn کن
        const { data: signInData } = await window.WAM_SB.client.auth.signInWithPassword({
          email: email,
          password: password
        });
        return { ok: true, user: signInData?.user, existed: true };
      }
      return { ok: false, error: error.message };
    }

    // اگه session نداره، signIn کن
    if (!data.session && data.user) {
      await window.WAM_SB.client.auth.signInWithPassword({
        email: email,
        password: password
      });
    }

    return { ok: true, user: data.user, existed: false };
  }

  // ═══════════════════════════════════════
  // Seed ادمین‌ها
  // ═══════════════════════════════════════
  async function seedAdmins() {
    log('🚀 شروع Seed ادمین‌ها...');
    await window.WAM_SB.client.auth.signOut();

    const result = { success: 0, failed: 0, existed: 0, errors: [] };

    for (const admin of SEED_DATA.admins) {
      try {
        // Auth
        const authResult = await createAuthUser(admin.mobile, admin.password, {
          full_name: admin.fullName,
          role: admin.role
        });

        if (!authResult.ok) {
          logError(`Auth ادمین ${admin.mobile}`, authResult.error);
          result.failed++;
          result.errors.push({ mobile: admin.mobile, error: authResult.error });
          continue;
        }

        if (authResult.existed) {
          log(`⏭️ ادمین ${admin.fullName} از قبل هست`);
          result.existed++;
          continue;
        }

        const userId = authResult.user.id;

        // درج در admins
        const { error: insertError } = await window.WAM_SB.client
          .from('admins')
          .insert({
            user_id: userId,
            full_name: admin.fullName,
            email: admin.email,
            phone_number: admin.mobile,
            role: admin.role,
            is_active: true,
            permissions: {}
          });

        if (insertError) {
          logError(`درج ادمین ${admin.fullName}`, insertError);
          result.failed++;
          result.errors.push({ mobile: admin.mobile, error: insertError.message });
          continue;
        }

        logSuccess(`ادمین ${admin.fullName} (${admin.role})`);
        result.success++;

      } catch (e) {
        logError(`خطای ادمین ${admin.mobile}`, e);
        result.failed++;
      }
    }

    log(`📊 نتیجه ادمین‌ها: ${result.success} جدید، ${result.existed} قبلی، ${result.failed} ناموفق`);
    return result;
  }

  // ═══════════════════════════════════════
  // Seed کاربران (متقاضی + کارگزار)
  // ═══════════════════════════════════════
  async function seedUsers() {
    log('🚀 شروع Seed کاربران...');
    await window.WAM_SB.client.auth.signOut();

    const result = { success: 0, failed: 0, existed: 0, errors: [] };

    const allUsers = [
      ...SEED_DATA.applicants.map(u => ({ ...u, role: 'applicant' })),
      ...SEED_DATA.brokers.map(u => ({ ...u, role: 'broker' }))
    ];

    for (const user of allUsers) {
      try {
        const password = 'Wampay@' + user.mobile.slice(-6);

        const authResult = await createAuthUser(user.mobile, password, {
          full_name: user.fullName,
          phone: user.mobile,
          role: user.role
        });

        if (!authResult.ok) {
          logError(`Auth ${user.fullName}`, authResult.error);
          result.failed++;
          continue;
        }

        if (authResult.existed) {
          log(`⏭️ ${user.fullName} از قبل هست`);
          result.existed++;
          continue;
        }

        const userId = authResult.user.id;

        const { error: insertError } = await window.WAM_SB.client
          .from('users')
          .insert({
            id: userId,
            full_name: user.fullName,
            phone_number: user.mobile,
            national_code: user.nationalCode,
            role: user.role,
            status: 'active',
            email: mobileToEmail(user.mobile),
            metadata: { seeded: true, seededAt: new Date().toISOString() }
          });

        if (insertError) {
          logError(`درج ${user.fullName}`, insertError);
          result.failed++;
          continue;
        }

        logSuccess(`${user.role === 'broker' ? '💼' : '👤'} ${user.fullName}`);
        result.success++;

      } catch (e) {
        logError(`خطای ${user.mobile}`, e);
        result.failed++;
      }
    }

    log(`📊 نتیجه کاربران: ${result.success} جدید، ${result.existed} قبلی، ${result.failed} ناموفق`);
    return result;
  }

  // ═══════════════════════════════════════
  // Seed کامل
  // ═══════════════════════════════════════
  async function seedAll() {
    console.log('%c🌱 شروع Seed کامل دمو', 'color:#0b3b23;font-weight:bold;font-size:16px;');

    const startTime = Date.now();

    const adminsResult = await seedAdmins();
    const usersResult = await seedUsers();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('%c📊 نتیجه نهایی:', 'color:#d4a62a;font-weight:bold;');
    console.table({
      'ادمین‌ها': { 'جدید': adminsResult.success, 'قبلی': adminsResult.existed, 'ناموفق': adminsResult.failed },
      'کاربران': { 'جدید': usersResult.success, 'قبلی': usersResult.existed, 'ناموفق': usersResult.failed }
    });
    console.log(`⏱️ زمان: ${totalTime} ثانیه`);

    return {
      admins: adminsResult,
      users: usersResult,
      totalTime
    };
  }

  // ═══════════════════════════════════════
  // Export
  // ═══════════════════════════════════════
  window.WAM_SEED_DEMO = {
    seedAll,
    seedAdmins,
    seedUsers,
    getData: () => SEED_DATA
  };

  console.log('✅ Seed Demo v1.0.0 loaded');
  console.log('%c🎯 برای شروع: WAM_SEED_DEMO.seedAll()', 'color:#1e8e4a;font-weight:bold;');

})();