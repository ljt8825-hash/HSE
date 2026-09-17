<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 01 登录页（手机号 + 密码）
 * H5-GRID-LOGIN-02 接入独立移动端登录接口 POST /api/mobile/auth/login
 *
 * 冻结边界：
 * 1. 登录方式唯一：手机号 + 密码。禁止短信验证码 / 微信登录 / WPS OAuth。
 * 2. 走独立移动端入口（mobileLoginApi），不复用 PC /api/auth/login（其 username 语义
 *    与 PC 账号体系保持不变）；JWT 签发/结构、authStore 登录机制均未改动。
 * 3. 登录成功后业务身份为 employee_code（由服务端经 users.employee_id → employee
 *    权威链路解析后随响应返回）；本页不做任何本地身份解析。
 * 4. meta.ignoreAccess：允许未登录直达本页（与 /mw 同一机制），不影响全局路由守卫。
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { getAccessCodesApi, mobileLoginApi } from '#/api';
import { message } from '#/adapter/naive';
import { useAuthStore } from '#/store';

defineOptions({ name: 'MobileLogin' });

const router = useRouter();
const authStore = useAuthStore();
const accessStore = useAccessStore();

const form = reactive({ password: '', phone: '' });
const submitting = ref(false);
const errorMsg = ref('');

/** 已登录（如从工作台退出前误入）时提供直达入口 */
const loggedIn = computed(() => !!accessStore.accessToken);

function validate(): string {
  const phone = form.phone.trim();
  if (!phone) return '请输入手机号';
  if (!/^1\d{10}$/.test(phone)) return '请输入正确的 11 位手机号';
  if (!form.password) return '请输入密码';
  return '';
}

async function onSubmit() {
  if (submitting.value) return;
  errorMsg.value = '';
  const invalid = validate();
  if (invalid) {
    errorMsg.value = invalid;
    return;
  }
  submitting.value = true;
  try {
    // H5-GRID-LOGIN-02: 独立移动端登录（phone → users.phone → employee_id → employee_code）
    const { accessToken } = await mobileLoginApi({
      password: form.password,
      phone: form.phone.trim(),
    });
    if (!accessToken) {
      errorMsg.value = '登录失败，请稍后重试';
      return;
    }
    // 登录态保存与既有体系一致：accessStore + 用户信息/权限码，全部走现有封装
    accessStore.setAccessToken(accessToken);
    const [, accessCodes] = await Promise.all([
      authStore.fetchUserInfo(),
      getAccessCodesApi(),
    ]);
    accessStore.setAccessCodes(accessCodes);
    if (accessStore.loginExpired) {
      accessStore.setLoginExpired(false);
    }
    message.success('登录成功');
    await router.replace('/mobile/index');
  } catch (err) {
    const e = err as any;
    errorMsg.value =
      String(
        e?.response?.data?.message ?? e?.responseData?.message ?? e?.message ?? '',
      ).trim() || '登录失败，请检查手机号与密码后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-hero">
      <div class="login-hero__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />
        </svg>
      </div>
      <h1 class="login-hero__title">网格巡查</h1>
      <p class="login-hero__sub">现场巡查记录工具</p>
    </div>

    <template v-if="loggedIn">
      <div class="login-card">
        <p class="login-card__hint">当前已登录，可直接进入工作台。</p>
        <button type="button" class="login-submit m-btn" @click="router.replace('/mobile/index')">
          进入工作台
        </button>
      </div>
    </template>

    <template v-else>
      <div class="login-card">
        <label class="field" for="ml-phone">
          <span class="field__label">手机号</span>
          <input
            id="ml-phone"
            v-model="form.phone"
            class="field__input"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            autocomplete="username"
            placeholder="请输入手机号"
          />
        </label>

        <label class="field" for="ml-password">
          <span class="field__label">密码</span>
          <input
            id="ml-password"
            v-model="form.password"
            class="field__input"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @keyup.enter="onSubmit"
          />
        </label>

        <p v-if="errorMsg" class="login-error" role="alert">{{ errorMsg }}</p>

        <button
          type="button"
          class="login-submit m-btn"
          :disabled="submitting"
          @click="onSubmit"
        >
          {{ submitting ? '登录中…' : '登录' }}
        </button>

        <p class="login-footnote">
          登录成功后以员工编码（employee_code）作为业务身份；手机号仅用于登录验证。
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
  box-sizing: border-box;
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 20px calc(32px + env(safe-area-inset-bottom));
  background: #f4f5f7;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  -webkit-tap-highlight-color: transparent;
}

.login-hero {
  text-align: center;
}

.login-hero__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: #2f7dcd;
  color: #fff;
}

.login-hero__logo svg {
  width: 34px;
  height: 34px;
}

.login-hero__title {
  margin: 14px 0 0;
  font-size: 24px;
  font-weight: 700;
  color: #1f2329;
}

.login-hero__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #8a8f99;
}

.login-card {
  background: #fff;
  border-radius: 14px;
  padding: 20px 16px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.login-card__hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: #646a73;
  text-align: center;
}

.field {
  display: block;
  margin-bottom: 14px;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #646a73;
}

.field__input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
  color: #1f2329;
  font-size: 16px;
  font-family: inherit;
  padding: 10px 12px;
  appearance: none;
}

.field__input:focus {
  border-color: #2f7dcd;
  outline: 2px solid #eaf3fc;
}

.login-error {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.login-submit {
  width: 100%;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  min-height: 48px;
  border-radius: 12px;
  cursor: pointer;
}

.login-submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.login-footnote {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}
</style>
