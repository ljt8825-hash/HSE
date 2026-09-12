<script lang="ts" setup>
import { ref } from 'vue';

import { Settings } from '@vben/icons';

import { VbenIconButton } from '@vben-core/shadcn-ui';

import Preferences from './preferences.vue';

const emit = defineEmits<{ clearPreferencesAndLogout: [] }>();

const preferencesRef = ref<InstanceType<typeof Preferences>>();

function clearPreferencesAndLogout() {
  emit('clearPreferencesAndLogout');
}

function openPreferences() {
  preferencesRef.value?.open();
}
</script>
<template>
  <Preferences
    ref="preferencesRef"
    @clear-preferences-and-logout="clearPreferencesAndLogout"
  >
    <VbenIconButton
      class="hover:animate-[shrink_0.3s_ease-in-out]"
      @click="openPreferences"
    >
      <Settings class="size-4 text-foreground" />
    </VbenIconButton>
  </Preferences>
</template>
