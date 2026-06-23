<script setup lang="ts">
// 首頁：完整時間軸（entries 已由 pipeline 依事件時間新到舊排序）。
// 視覺先求乾淨中性，正式設計之後用 Claude design 重做。
const entries = useEntries()

const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`

useSeoMeta({
  title: '漏水紀錄',
  description: '住處漏水點的長期觀察紀錄。',
  ogTitle: '漏水紀錄',
  ogDescription: '住處漏水點的長期觀察紀錄。',
})
</script>

<template>
  <main class="wrap">
    <header class="head">
      <h1>漏水紀錄</h1>
      <p class="sub">共 {{ entries.length }} 則・時間軸由新到舊</p>
    </header>

    <p v-if="entries.length === 0" class="empty">還沒有任何紀錄。</p>

    <ol class="timeline">
      <li v-for="e in entries" :key="e.id" class="item">
        <NuxtLink :to="`/entry/${e.id}`" class="card">
          <time class="time">{{ formatDateTime(e.eventTimestamp) }}</time>
          <h2 v-if="e.title" class="title">{{ e.title }}</h2>
          <ul v-if="e.keyEvents.length" class="tags">
            <li v-for="t in e.keyEvents" :key="t" class="tag">{{ t }}</li>
          </ul>
          <p v-if="e.description" class="desc">{{ e.description }}</p>
          <div v-if="e.photos.length" class="thumbs">
            <img
              v-for="(p, i) in e.photos"
              :key="i"
              :src="asset(p.thumb)"
              :alt="`${e.title || '紀錄'} 照片 ${i + 1}`"
              loading="lazy"
            />
          </div>
        </NuxtLink>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
  font-family: system-ui, sans-serif;
  color: #1a1a1a;
}
.head {
  margin-bottom: 1.5rem;
}
.head h1 {
  margin: 0;
  font-size: 1.6rem;
}
.sub {
  margin: 0.25rem 0 0;
  color: #777;
  font-size: 0.9rem;
}
.empty {
  color: #777;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card {
  display: block;
  padding: 1rem;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
}
.card:hover {
  border-color: #bbb;
}
.time {
  color: #777;
  font-size: 0.85rem;
}
.title {
  margin: 0.25rem 0 0.5rem;
  font-size: 1.1rem;
}
.tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  padding: 0;
}
.tag {
  font-size: 0.78rem;
  background: #eef2ff;
  color: #3b5bdb;
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
}
.desc {
  margin: 0.5rem 0;
  white-space: pre-wrap;
  line-height: 1.6;
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.thumbs img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
}
</style>
