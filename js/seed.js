// ============================================
// js/seed.js — ساخت داده‌های اولیه برای دمو
// نسخه: 1.0.0
// تاریخ: 1405/07/16
// توضیح: با یه کلیک، داده‌های دمو رو توی Supabase می‌سازه
// ============================================

(function () {
  'use strict';

  if (!window.WAM_SB) {
    console.error('❌ Seed: WAM_SB not loaded');
    return;
  }

  // ============================================
  // داده‌های Seed
  // ============================================

  const SEED_DATA = {
    // 🏛️ ادمین‌ها
    admins: [
      {
        mobile: '09121111111',
        password: 'Wampay@2026',
        fullName: 'مدیر ارشد سیستمی',
        email: 'superadmin@wampay.local',
        role: 'super_admin'
      },
      {
        mobile: '09122222222',
        password: 'Wampay@2026',
        fullName: 'کارشناس تأیید',
        email: 'verifier@wampay.local',
        role: 'admin'
      },
      {
        mobile: '09123333333',
        password: 'Wampay@2026',
        fullName: 'کارشناس مشاوره',
        email: 'consultation@wampay.local',
        role: 'admin'
      }
    ],

    // 💼 کارگزارها
    brokers: [
      {
        mobile: '09351111111',
        fullName: 'محمد صادقی',
        nationalCode: '0012345678',
        email: 'sadeghi@wampay.local'
      },
      {
        mobile: '09352222222',
        fullName: 'فاطمه موسوی',
        nationalCode: '0023456789',
        email: 'mousavi@wampay.local'
      },
      {
        mobile: '09353333333',
        fullName: 'حسن رحیمی',
        nationalCode: '0034567890',
        email: 'rahimi@wampay.local'
      }
    ],

    // 👤 متقاضی‌ها
    applicants: [
      {
        mobile: '09141111111',
        fullName: 'رضا محمدی',
        nationalCode: '1234567890',
        birthDate: '1370/05/15',
        email: 'reza@wampay.local'
      },
      {
        mobile: '09142222222',
        fullName: 'سارا احمدی',
        nationalCode: '2345678901',
        birthDate: '1372/08/22',
        email: 'sara@wampay.local'
      },
      {
        mobile: '09143333333',
        fullName: 'علی رضایی',
        nationalCode: '3456789012',
        birthDate: '1368/03/10',
        email: 'ali@wampay.local'
      },
      {
        mobile: '09144444444',
        fullName: 'مریم کریمی',
        nationalCode: '4567890123',
        birthDate: '1375/11/05',
        email: 'maryam@wampay.local'
      },
      {
        mobile: '09145555555',
        fullName: 'حسین نوری',
        nationalCode: '5678901234',
        birthDate: '1365/02/18',
        email: 'hossein@wampay.local'
      }
    ],

    // 📁 پرونده‌ها
    applications: [
      {
        applicantIndex: 0,   // رضا محمدی
        loanType: 'qarz_hasaneh',
        loanBank: 'resalat',
        loanAmount: 200000000,   // ۲۰۰ میلیون
        status: 'draft',
        currentStep: 1
      },
      {
        applicantIndex: 1,   // سارا احمدی
        loanType: 'housing',
        loanBank: 'maskan',
        loanAmount: 500000000,
        status: 'submitted',
        currentStep: 2
      },
      {
        applicantIndex: 2,   // علی رضایی
        loanType: 'car',
        loanBank: 'melli',
        loanAmount: 150000000,
        status: 'under_review',
        currentStep: 3
      },
      {
        applicantIndex: 3,   // مریم کریمی
        loanType: 'qarz_hasaneh',
        loanBank: 'mehr',
        loanAmount: 100000000,
        status: 'under_review',
        currentStep: 3
      },
      {
        applicantIndex: 4,   // حسین نوری
        loanType: 'housing',
        loanBank: 'maskan',
        loanAmount: 800000000,
        status: 'approved',
        currentStep: 4
      },
      {
        applicantIndex: 0,   // رضا محمدی
        loanType: 'personal',
        loanBank: 'saderat',
        loanAmount: 50000000,
        status: 'approved',
        currentStep: 4
      },
      {
        applicantIndex: 1,   // سارا احمدی
        loanType: 'personal',
        loanBank: 'resalat',
        loanAmount: 300000000,
        status: 'completed',
        currentStep: 5
      },
      {
        applicantIndex: 2,   // علی رضایی
        loanType: 'education',
        loanBank: 'melli',
        loanAmount: 100000000,
        status: 'draft',
        currentStep: 1
      }
    ]
  };

  // ============================================
  // توابع کمکی
  // ============================================

  function log(msg) {
    console.log(`[Seed] ${msg}`);
  }

  function logSuccess(msg) {
    console.log(`[Seed] ✅ ${msg}`);
  }

  function logError(msg, err) {
    console.error(`[Seed] ❌ ${msg}`, err);
  }

  function mobileToEmail(mobile) {
    return `${mobile}@wampay.local`;
  }

  function generateAppNumber(index) {
    return `WP-2026-${String(index + 1).padStart(4, '0')}`;
  }

  // ============================================
  // ساخت کاربر Auth
  // ============================================

  async function createAuthUser(mobile, password, metadata) {
    const email = mobileToEmail(mobile);
    
    // تلاش برای signUp
    const { data, error } = await window.WAM_SB.client.auth.signUp({
      email: email,
      password: password,
      options: { data: metadata }
    });

    if (error) {
      // اگه قبلاً هست، signIn کن
      if (error.message.includes('already')) {
        const { data: signInData } = await window.WAM_SB.client.auth.signInWithPassword({
          email: email,
          password: password
        });
        return { ok: true, user: signInData?.user };
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

    return { ok: true, user: data.user };
  }

  // ============================================
  // Seed ادمین‌ها
  // ============================================

  async function seedAdmins() {
    log('🚀 شروع Seed ادمین‌ها...');
    
    await window.WAM_SB.client.auth.signOut();
    
    const result = { success: 0, failed: 0, admins: [], errors: [] };

    for (const admin of SEED_DATA.admins) {
      try {
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

        const userId = authResult.user.id;

        // درج توی admins
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
          logError(`درج ادمین ${admin.mobile}`, insertError);
          result.failed++;
          result.errors.push({ mobile: admin.mobile, error: insertError.message });
          continue;
        }

        logSuccess(`ادمین ${admin.fullName} (${admin.role})`);
        result.success++;
        result.admins.push({ ...admin, userId });

      } catch (e) {
        logError(`خطای ادمین ${admin.mobile}`, e);
        result.failed++;
        result.errors.push({ mobile: admin.mobile, error: e.message });
      }
    }

    log(`📊 نتیجه ادمین‌ها: ${result.success} موفق، ${result.failed} ناموفق`);
    return result;
  }

  // ============================================
  // Seed کاربران (کارگزار + متقاضی)
  // ============================================

  async function seedUsers() {
    log('🚀 شروع Seed کاربران...');
    
    await window.WAM_SB.client.auth.signOut();
    
    const result = { success: 0, failed: 0, users: [], errors: [] };

    // 🆕 جمع‌آوری همه کاربران (کارگزار + متقاضی)
    const allUsers = [
      ...SEED_DATA.brokers.map(b => ({ ...b, role: 'broker' })),
      ...SEED_DATA.applicants.map(a => ({ ...a, role: 'applicant' }))
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
          result.errors.push({ mobile: user.mobile, error: authResult.error });
          continue;
        }

        const userId = authResult.user.id;

        // درج توی users
        const { error: insertError } = await window.WAM_SB.client
          .from('users')
          .insert({
            id: userId,
            full_name: user.fullName,
            phone_number: user.mobile,
            national_code: user.nationalCode || null,
            role: user.role,
            status: 'active',
            email: user.email,
            metadata: {
              birthDate: user.birthDate || null,
              seeded: true,
              seededAt: new Date().toISOString()
            }
          });

        if (insertError) {
          logError(`درج کاربر ${user.mobile}`, insertError);
          result.failed++;
          result.errors.push({ mobile: user.mobile, error: insertError.message });
          continue;
        }

        logSuccess(`${user.role === 'broker' ? '💼' : '👤'} ${user.fullName}`);
        result.success++;
        result.users.push({ ...user, userId });

      } catch (e) {
        logError(`خطای کاربر ${user.mobile}`, e);
        result.failed++;
        result.errors.push({ mobile: user.mobile, error: e.message });
      }
    }

    log(`📊 نتیجه کاربران: ${result.success} موفق، ${result.failed} ناموفق`);
    return result;
  }

  // ============================================
  // Seed پرونده‌ها
  // ============================================

  async function seedApplications(users) {
    log('🚀 شروع Seed پرونده‌ها...');
    
    await window.WAM_SB.client.auth.signOut();
    
    const result = { success: 0, failed: 0, applications: [], errors: [] };
    const applicants = users.filter(u => u.role === 'applicant');

    if (applicants.length === 0) {
      logError('هیچ متقاضی‌ای پیدا نشد!');
      return result;
    }

    for (let i = 0; i < SEED_DATA.applications.length; i++) {
      const app = SEED_DATA.applications[i];
      const applicant = applicants[app.applicantIndex];

      if (!applicant) {
        logError(`متقاضی با index ${app.applicantIndex} پیدا نشد`);
        result.failed++;
        continue;
      }

      try {
        const appNumber = generateAppNumber(i);

        // ساخت application
        const { error } = await window.WAM_SB.client
          .from('applications')
          .insert({
            user_id: applicant.userId,
            application_number: appNumber,
            loan_type: app.loanType,
            loan_bank: app.loanBank,
            loan_amount: app.loanAmount,
            status: app.status,
            current_step: app.currentStep,
            total_steps: 5,
            personal_info: {
              fullName: applicant.fullName,
              mobile: applicant.mobile,
              nationalCode: applicant.nationalCode
            },
            financial_info: {},
            documents: []
          });

        if (error) {
          logError(`درج پرونده ${appNumber}`, error);
          result.failed++;
          result.errors.push({ appNumber, error: error.message });
          continue;
        }

        logSuccess(`📁 ${appNumber} — ${applicant.fullName} (${app.loanType})`);
        result.success++;
        result.applications.push({ appNumber, ...app });

      } catch (e) {
        logError(`خطای پرونده ${i + 1}`, e);
        result.failed++;
      }
    }

    log(`📊 نتیجه پرونده‌ها: ${result.success} موفق، ${result.failed} ناموفق`);
    return result;
  }

  // ============================================
  // Seed کامل
  // ============================================

  async function seedAll() {
    console.log('%c🌱 شروع Seed کامل', 'color:#0b3b23;font-weight:bold;font-size:16px;');
    
    const startTime = Date.now();

    // ۱. ادمین‌ها
    const adminsResult = await seedAdmins();

    // ۲. کاربران (کارگزار + متقاضی)
    const usersResult = await seedUsers();

    // ۳. پرونده‌ها
    const appsResult = await seedApplications(usersResult.users);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('%c📊 نتیجه نهایی Seed:', 'color:#d4a62a;font-weight:bold;font-size:14px;');
    console.table({
      'ادمین‌ها': { 'موفق': adminsResult.success, 'ناموفق': adminsResult.failed },
      'کاربران': { 'موفق': usersResult.success, 'ناموفق': usersResult.failed },
      'پرونده‌ها': { 'موفق': appsResult.success, 'ناموفق': appsResult.failed }
    });
    console.log(`⏱️ زمان کل: ${totalTime} ثانیه`);

    // 🆕 ذخیره‌ی شناسه‌ها برای استفاده‌ی بعدی
    const seedLog = {
      admins: adminsResult.admins,
      users: usersResult.users,
      applications: appsResult.applications,
      seededAt: new Date().toISOString()
    };
    localStorage.setItem('wamPaySeedLog', JSON.stringify(seedLog));

    return {
      admins: adminsResult,
      users: usersResult,
      applications: appsResult,
      totalTime: totalTime
    };
  }

  // ============================================
  // Export
  // ============================================

  window.WAM_SEED = {
    seedAll,
    seedAdmins,
    seedUsers,
    seedApplications,
    getSeedData: () => SEED_DATA,
    getSeedLog: () => JSON.parse(localStorage.getItem('wamPaySeedLog') || 'null'),
    clearSeedLog: () => localStorage.removeItem('wamPaySeedLog')
  };

  console.log('✅ Seed module v1.0.0 loaded');
  console.log('%c🎯 برای شروع Seed: WAM_SEED.seedAll()', 'color:#1e8e4a;font-weight:bold;');
})();