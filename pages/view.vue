<script setup lang="ts">
// 照片檢視 Lightbox /view：全站照片攤平連續瀏覽 + 常駐時間軸 rail + 鍵盤導覽。
// 初始位置由 ?r=recordId&p=photoIndex 帶入（首頁/單則頁點照片進來）。
import type { Entry } from '~/composables/useEntries'

const route = useRoute()
const router = useRouter()
const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`

const entries = useEntries()
const flat = flattenPhotos(entries)
const railGroups = groupByDay(entries.filter((e) => e.photos.length))

// 每則的第一張全域索引（flat 內每則照片連續）
const recordList: { entry: Entry; first: number }[] = []
const posById = new Map<string, number>()
for (const f of flat) {
  if (!posById.has(f.entry.id)) {
    posById.set(f.entry.id, recordList.length)
    recordList.push({ entry: f.entry, first: f.globalIndex })
  }
}

const len = flat.length
const idx = ref(0)
const current = computed(() => flat[idx.value])
const currentEntry = computed(() => current.value?.entry)
const currentPhotos = computed(() => currentEntry.value?.photos ?? [])
const currentFirst = computed(() => recordList[posById.get(currentEntry.value!.id)!].first)

const go = (i: number) => {
  idx.value = Math.max(0, Math.min(len - 1, i))
}
const nextPhoto = () => go(idx.value + 1)
const prevPhoto = () => go(idx.value - 1)
const jumpRecord = (delta: number) => {
  const p = posById.get(currentEntry.value!.id)!
  go(recordList[Math.max(0, Math.min(recordList.length - 1, p + delta))].first)
}
const goRecord = (entry: Entry) => go(recordList[posById.get(entry.id)!].first)

// 手機版：rail 預設收合，點選後自動關起來
const railOpen = ref(false)
const selectRecord = (entry: Entry) => {
  goRecord(entry)
  railOpen.value = false
}
const goPhotoInRecord = (pi: number) => go(currentFirst.value + pi)
const isCurrent = (entry: Entry) => entry.id === currentEntry.value?.id

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextPhoto()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevPhoto()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    jumpRecord(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    jumpRecord(-1)
  } else if (e.key === 'Escape') {
    router.push('/')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  const r = route.query.r as string | undefined
  const p = parseInt(route.query.p as string)
  if (r && posById.has(r)) go(recordList[posById.get(r)!].first + (Number.isNaN(p) ? 0 : p))
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

useSeoMeta({ title: '照片檢視 · 漏水紀錄', robots: 'noindex' })
</script>

<template>
  <div class="viewer">
    <!-- top bar -->
    <div class="topbar">
      <div class="tb-left" v-if="len">
        <button class="rail-toggle mono" :aria-expanded="railOpen" @click="railOpen = !railOpen">
          ≡ 時間軸
        </button>
        <span class="mono seq">{{ idx + 1 }}</span>
        <span class="mono total">/ {{ len }}</span>
        <span class="mono fname">{{ seqName(current.photoIndex) }}</span>
      </div>
      <div class="tb-right">
        <span class="mono hint">← → 照片 · ↑ ↓ 事件 · Esc 關閉</span>
        <NuxtLink to="/" class="close" aria-label="關閉">×</NuxtLink>
      </div>
    </div>

    <div v-if="!len" class="empty">尚無照片。</div>

    <div v-else class="main">
      <!-- 左欄：時間軸 rail（手機版可收合） -->
      <aside class="rail" :class="{ open: railOpen }">
        <div class="rail-title mono">時間軸 · {{ recordList.length }} 則</div>
        <div v-for="g in railGroups" :key="g.key" class="rail-day">
          <div class="rail-day-head mono">{{ g.monthDay }} {{ g.weekday }}</div>
          <button
            v-for="e in g.entries"
            :key="e.id"
            class="rail-row"
            :class="{ active: isCurrent(e), key: e.keyEvents.length }"
            @click="selectRecord(e)"
          >
            <span class="bar" />
            <span class="mono t">{{ formatTime(e.eventTimestamp) }}</span>
            <span class="lbl">{{ e.keyEvents[0] || '紀錄' }}</span>
            <span class="mono n">{{ e.photos.length }}</span>
          </button>
        </div>
      </aside>

      <!-- 中欄：stage -->
      <section class="stage">
        <div class="frame">
          <img :src="asset(current.web)" :alt="`照片 ${current.photoIndex + 1}`" />
          <span class="mono stage-badge">本則 {{ current.photoIndex + 1 }} / {{ currentPhotos.length }}</span>
          <button class="nav prev" :disabled="idx === 0" aria-label="上一張" @click="prevPhoto">‹</button>
          <button class="nav next" :disabled="idx === len - 1" aria-label="下一張" @click="nextPhoto">›</button>
        </div>
        <div class="thumbs">
          <button
            v-for="(p, i) in currentPhotos"
            :key="i"
            class="thumb"
            :class="{ on: i === current.photoIndex }"
            @click="goPhotoInRecord(i)"
          >
            <img :src="asset(p.thumb)" :alt="`縮圖 ${i + 1}`" />
          </button>
        </div>
      </section>

      <!-- 右欄：info -->
      <aside class="info">
        <div class="mono i-date">{{ formatDateTimeSlash(currentEntry!.eventTimestamp) }}</div>
        <div v-if="currentEntry!.keyEvents.length" class="tags">
          <span v-for="t in currentEntry!.keyEvents" :key="t" class="tag">
            <span class="mono kicker">關鍵</span>
            <span class="kw">{{ t }}</span>
          </span>
        </div>
        <p v-if="currentEntry!.description" class="i-desc">{{ currentEntry!.description }}</p>
        <div class="i-meta">
          <div class="mono"><span class="k">檔名</span>{{ seqName(current.photoIndex) }}</div>
          <div class="mono"><span class="k">本則照片</span>{{ current.photoIndex + 1 }} / {{ currentPhotos.length }}</div>
        </div>
        <div class="mono i-foot">已移除 EXIF 地理資訊 · 最大邊 2048px · 提供縮圖</div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  min-height: 100vh;
  background: var(--card);
  color: var(--text);
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px clamp(14px, 3vw, 22px);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.tb-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* rail 收合鈕：桌機隱藏，手機才出現 */
.rail-toggle {
  display: none;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  padding: 4px 9px;
  cursor: pointer;
  margin-right: 4px;
}
.seq {
  font-size: 18px;
  color: var(--accent);
}
.total {
  font-size: 12px;
  color: var(--faint);
}
.fname {
  font-size: 11px;
  color: var(--muted-3);
  margin-left: 6px;
}
.tb-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hint {
  font-size: 11px;
  color: var(--faint);
}
.close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  text-decoration: none;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
}
.close:hover {
  background: var(--stage);
}
.empty {
  padding: 4rem;
  text-align: center;
  color: var(--muted-2);
}
.main {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
}

/* rail */
.rail {
  flex: 1 1 200px;
  max-width: 260px;
  min-width: 184px;
  border-right: 1px solid var(--border);
  padding: 16px 0;
  overflow-y: auto;
}
.rail-title {
  font-size: 11px;
  color: var(--faint);
  padding: 0 16px 10px;
}
.rail-day-head {
  font-size: 11px;
  color: var(--muted);
  padding: 10px 16px 4px;
}
.rail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 5px 14px 5px 0;
  text-align: left;
  font-family: inherit;
}
.rail-row .bar {
  width: 3px;
  align-self: stretch;
  background: transparent;
}
.rail-row.active {
  background: var(--accent-bg);
}
.rail-row.active .bar {
  background: var(--accent);
}
.rail-row .t {
  font-size: 11px;
  color: var(--faint);
}
.rail-row .lbl {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--muted-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail-row .n {
  font-size: 10px;
  color: var(--faint-2);
}
.rail-row.active .lbl {
  color: var(--text);
}
.rail-row.active.key .lbl {
  color: var(--accent-text);
}

/* stage */
.stage {
  flex: 3 1 360px;
  background: var(--stage);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: clamp(16px, 3vw, 28px);
}
.frame {
  position: relative;
  display: flex;
}
.frame img {
  max-width: min(100%, 2048px);
  max-height: 80vh;
  object-fit: contain;
  display: block;
}
.stage-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 10px;
  color: var(--muted);
  background: rgba(251, 251, 250, 0.85);
  padding: 2px 6px;
  border-radius: var(--r-sm);
}
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: rgba(251, 251, 250, 0.92);
  color: var(--text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.nav.prev {
  left: 10px;
}
.nav.next {
  right: 10px;
}
.nav:disabled {
  opacity: 0.3;
  cursor: default;
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.thumb {
  width: 64px;
  height: 46px;
  border: 1px solid var(--axis);
  border-radius: var(--r-sm);
  padding: 0;
  overflow: hidden;
  opacity: 0.55;
  cursor: pointer;
  background: var(--stripe);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb.on {
  border-color: var(--accent);
  opacity: 1;
}

/* info */
.info {
  flex: 1 1 260px;
  max-width: 340px;
  border-left: 1px solid var(--border);
  background: var(--panel);
  padding: clamp(16px, 3vw, 22px);
}
.i-date {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 12px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--r-sm);
}
.kicker {
  font-size: 9px;
  color: var(--accent-text);
}
.kw {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-text);
}
.i-desc {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-2);
  white-space: pre-line;
  margin: 0 0 16px;
}
.i-meta {
  border-top: 1px solid var(--border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.i-meta .mono {
  font-size: 11px;
  color: var(--muted-2);
}
.i-meta .k {
  color: var(--faint);
  margin-right: 10px;
}
.i-foot {
  font-size: 9px;
  color: var(--faint-3);
  margin-top: 18px;
  line-height: 1.6;
}

/* 手機版：rail 收進可收合選單，預設藏起來；stage / info 直接堆疊 */
@media (max-width: 760px) {
  .rail-toggle {
    display: inline-flex;
  }
  .rail {
    display: none;
  }
  .rail.open {
    display: block;
    flex-basis: 100%;
    max-width: none;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
}
</style>
