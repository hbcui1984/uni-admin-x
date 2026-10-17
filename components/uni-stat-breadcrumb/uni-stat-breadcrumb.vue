<template>
  <view class="uni-breadcrumb-x">
    <template v-for="(route, index) in routes" :key="index">
      <text v-if="index" class="breadcrumb-separator">/</text>
      <text class="breadcrumb-label" :class="{ 'breadcrumb-link': route.to?.path }" @click="openRoute(route)">{{ route.name }}</text>
    </template>
  </view>
</template>

<script setup>
  import { computed } from 'vue';
  import { useStore } from 'vuex';

  defineOptions({ name: 'uni-stat-breadcrumb' });

  const store = useStore();
  const routes = computed(() => store.state.app.routes);
  const openRoute = (route) => {
    if (route.to?.path) uni.redirectTo({ url: route.to.path });
  };
</script>

<style>
  .uni-breadcrumb-x {
    flex: 1;
    display: flex;
    flex-direction: row;
    padding: 0 5px;
    min-height: 55px;
    line-height: 55px;
    align-items: center;
    flex-wrap: wrap;
  }
  .breadcrumb-label { font-size: 14px; color: #606266; line-height: 24px; }
  .breadcrumb-link { color: #2979ff; cursor: pointer; }
  .breadcrumb-separator { margin: 0 10px; font-size: 14px; color: #c0c4cc; line-height: 24px; }
</style>
