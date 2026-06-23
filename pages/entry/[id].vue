<script setup lang="ts">
// 單筆分享頁：/entry/{recordId}。generate 時由首頁連結被爬到並預渲染。
// OG meta 用絕對網址，方便分享到 IM。
const route = useRoute()
const entry = useEntry(route.params.id as string)
if (!entry) {
  throw createError({ statusCode: 404, statusMessage: '找不到這則紀錄', fatal: true })
}
const e = entry

const config = useRuntimeConfig()
const base = config.app.baseURL.replace(/\/$/, '')
const site = (config.public.siteUrl as string).replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`
const absolute = (p: string) => `${site}/${p.replace(/^\//, '')}`

const shareTitle = e.title || (e.keyEvents[0] ? `${e.keyEvents[0]}・${formatDate(e.eventTimestamp)}` : `漏水紀錄・${formatDate(e.eventTimestamp)}`)
const excerpt = e.description.replace(/\s+/g, ' ').trim().slice(0, 100)
const ogImage = e.photos[0] ? absolute(e.photos[0].web) : undefined

useSeoMeta({
  title: shareTitle,
  description: excerpt,
  ogType: 'article',
  ogTitle: shareTitle,
  ogDescription: excerpt,
  ogImage: ogImage,
  twitterCard: ogImage ? 'summary_large_image' : 'summary',
})
</script>

<template>
  <main class="wrap">
    <NuxtLink to="/" class="back">← 回時間軸</NuxtLink>
    <article>
      <time class="time">{{ formatDateTime(e.eventTimestamp) }}</time>
      <h1 v-if="e.title" class="title">{{ e.title }}</h1>
      <ul v-if="e.keyEvents.length" class="tags">
        <li v-for="t in e.keyEvents" :key="t" class="tag">{{ t }}</li>
      </ul>
      <p v-if="e.description" class="desc">{{ e.description }}</p>
      <div v-if="e.photos.length" class="photos">
        <a
          v-for="(p, i) in e.photos"
          :key="i"
          :href="asset(p.web)"
          target="_blank"
          rel="noopener"
        >
          <img :src="asset(p.web)" :alt="`照片 ${i + 1}`" loading="lazy" />
        </a>
      </div>
    </article>
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
.back {
  display: inline-block;
  margin-bottom: 1rem;
  color: #3b5bdb;
  text-decoration: none;
  font-size: 0.9rem;
}
.time {
  color: #777;
  font-size: 0.9rem;
}
.title {
  margin: 0.25rem 0 0.75rem;
  font-size: 1.5rem;
}
.tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1rem;
  padding: 0;
}
.tag {
  font-size: 0.8rem;
  background: #eef2ff;
  color: #3b5bdb;
  border-radius: 999px;
  padding: 0.15rem 0.7rem;
}
.desc {
  white-space: pre-wrap;
  line-height: 1.7;
  margin: 1rem 0 1.5rem;
}
.photos {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.photos img {
  width: 100%;
  height: auto;
  border-radius: 8px;
}
</style>
