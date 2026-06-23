<script setup lang="ts">
// 佔位首頁，確認 static generate 與資料讀取可運作；正式時間軸版面在 task 9。
const entries = useEntries()
useSeoMeta({ title: '漏水紀錄' })
</script>

<template>
  <main class="wrap">
    <h1>漏水紀錄</h1>
    <p>目前共 {{ entries.length }} 則紀錄。</p>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: system-ui, sans-serif;
}
</style>
