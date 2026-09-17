<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 移动登录（V1 临时身份）
 *
 * ⚠️ 页面必须如实告知：手机号登录是**临时身份识别**，不是正式安全认证。
 * 流程：手机号 → 查询手机端账号表 → 命中且启用 ⇒ 加载身份进入移动端。
 * 未实现（本阶段明确不做）：短信验证码 / 企业微信 / 钉钉 / 企业身份。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { loginByPhone, transportInfo } from '#/api/mw';
import { TEST_ACCOUNTS } from '#/api/mw/core/seed';

defineOptions({ name: 'MwLogin' });

const router = useRouter();
const info = transportInfo();

const phone = ref('');
const loading = ref(false);
const errorMsg = ref('');

async function submit() {
  errorMsg.value = '';
  loading.value = true;
  try {
    const r = await loginByPhone(phone.value);
    if (!r.ok) {
      errorMsg.value = r.message;
      return;
    }
    await router.replace('/mw/home');
  } finally {
    loading.value = false;
  }
}

function fill(p: string) {
  phone.value = p;
  errorMsg.value = '';
}
</script>

<template>
  <div class="mobile-shell mw-login">
    <div class="mw-login__head">
      <div class="mw-login__logo">HSE</div>
      <h1 class="mw-login__title">移动 HSE · 三违巡查</h1>
      <p class="mw-login__sub">WPS 数据驱动的现场移动应用（V1）</p>
    </div>

    <div class="m-card mw-login__card">
      <label class="mw-label" for="mw-phone">手机号</label>
      <input
        id="mw-phone"
        v-model="phone"
        class="mw-input"
        type="tel"
        inputmode="numeric"
        autocomplete="tel"
        placeholder="请输入登记手机号"
        @keyup.enter="submit"
      />

      <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>

      <button
        class="mw-btn mw-btn--primary"
        type="button"
        :disabled="loading"
        @click="submit"
      >
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <p class="mw-tip">
        V1 登录为<strong>手机号临时身份识别</strong>，不等同于正式安全认证（无短信验证码、无企业身份）。
        后续将升级为「手机号 + 短信验证码」，再升级为企业身份体系。
      </p>
    </div>

    <div v-if="info.isTestData" class="m-card mw-login__test">
      <div class="mw-login__test-title">当前为 TEST 占位账号（点击填充）</div>
      <button
        v-for="a in TEST_ACCOUNTS"
        :key="a.accountId"
        class="mw-testacc m-btn"
        type="button"
        @click="fill(a.phone)"
      >
        <span class="mw-testacc__p">{{ a.phone }}</span>
        <span class="mw-testacc__n">{{ a.name }}</span>
        <span class="mw-testacc__s">{{ a.status === 'ENABLED' ? '启用' : '停用' }}</span>
      </button>
      <p class="mw-tip">
        ⚠️ 真实花名册与三违行为<strong>尚未提供</strong>，当前全部为 TEST 占位数据，
        不得用于真实业务登记。
      </p>
    </div>
  </div>
</template>

<style scoped>
.mw-login {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  padding: 28px 16px calc(28px + env(safe-area-inset-bottom));
  background: #f4f5f7;
  color: #1f2329;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  --m-primary: #2f7dcd;
  --m-border: #ebedf0;
}

.mw-login__head {
  text-align: center;
  padding: 18px 0 6px;
}

.mw-login__logo {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 16px;
  background: #2f7dcd;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mw-login__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.mw-login__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #646a73;
}

.mw-login__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px;
}

.mw-label {
  font-size: 13px;
  color: #646a73;
}

.mw-input {
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--m-border, #ebedf0);
  border-radius: 10px;
  font-size: 17px;
  background: #fff;
  color: #1f2329;
  outline: none;
}

.mw-input:focus {
  border-color: #2f7dcd;
}

.mw-btn {
  min-height: 48px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  background: #f2f3f5;
  color: #1f2329;
  touch-action: manipulation;
}

.mw-btn--primary {
  background: #2f7dcd;
  color: #fff;
}

.mw-btn:disabled {
  opacity: 0.6;
}

.mw-error {
  margin: 0;
  color: #d4380d;
  font-size: 13px;
}

.mw-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}

.mw-login__test {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.mw-login__test-title {
  font-size: 13px;
  font-weight: 600;
  color: #ad6800;
}

.mw-testacc {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #ffe7ba;
  border-radius: 10px;
  background: #fff7e6;
  font-size: 13px;
}

.mw-testacc__p {
  font-weight: 600;
  color: #1f2329;
}

.mw-testacc__n {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #646a73;
  text-align: left;
}

.mw-testacc__s {
  color: #ad6800;
}
</style>
