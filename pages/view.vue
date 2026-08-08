<script setup lang="ts">
// 檢視 Lightbox /view：全站媒體（照片與影片）攤平連續瀏覽 + 常駐時間軸 rail + 鍵盤導覽。
// 初始位置由 ?r=recordId&p=mediaIndex 帶入（首頁/單則頁點縮圖進來）。
import type { Entry } from '~/composables/useEntries'

const route = useRoute()
const router = useRouter()
const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`

const entries = useEntries()
const flat = flattenMedia(entries)
const railGroups = groupByDay(entries.filter((e) => e.media.length))

// 每則的第一個全域索引（flat 內每則的媒體連續）
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
const currentMedia = computed(() => currentEntry.value?.media ?? [])
const currentFirst = computed(() => recordList[posById.get(currentEntry.value!.id)!].first)

// 分成兩個 computed 讓 template 拿到收窄後的型別，不用在每個欄位上斷言
const currentPhoto = computed(() => {
  const m = current.value?.item
  return m && isPhoto(m) ? m : null
})
const currentVideo = computed(() => {
  const m = current.value?.item
  return m && isVideo(m) ? m : null
})

const go = (i: number) => {
  idx.value = Math.max(0, Math.min(len - 1, i))
}
const nextMedia = () => go(idx.value + 1)
const prevMedia = () => go(idx.value - 1)
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
const goMediaInRecord = (mi: number) => go(currentFirst.value + mi)
const isCurrent = (entry: Entry) => entry.id === currentEntry.value?.id

/** 事件是不是發生在 <video> 上（含它的內建控制列） */
const inVideo = (t: EventTarget | null): boolean =>
  !!(t as HTMLElement | null)?.closest?.('video')

// 切換時顯示 loading skeleton，避免停在前一張讓人以為卡住
const stageImg = ref<HTMLImageElement | null>(null)
const imgLoading = ref(false)
watch(idx, () => {
  // 影片 slide 不用骨架：poster 會立刻顯示，而且 <video> 不會觸發 <img> 的
  // @load，骨架一旦設起來就再也清不掉，會變成永遠在閃的灰底。
  imgLoading.value = !currentVideo.value
})
const onImgLoad = () => {
  imgLoading.value = false
}

// 手機觸控：水平滑動切換（左滑下一個、右滑上一個）
let touchX = 0
let touchY = 0
let swipeArmed = false
const onTouchStart = (e: TouchEvent) => {
  // 拖影片進度條的手勢也會冒泡到 .frame，不擋的話一放開就跳到下一個
  swipeArmed = !inVideo(e.target)
  touchX = e.changedTouches[0].clientX
  touchY = e.changedTouches[0].clientY
}
const onTouchEnd = (e: TouchEvent) => {
  if (!swipeArmed) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  // 水平位移夠大、且明顯比垂直大（避免和捲動衝突）才觸發
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) nextMedia()
    else prevMedia()
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // 影片全螢幕時 Esc 是用來退出全螢幕的，不要順手把人踢回首頁
    if (document.fullscreenElement) return
    router.push('/')
    return
  }
  // 焦點在影片上時，←/→ 是瀏覽器內建的快轉倒退、↑↓ 是音量，讓給它處理
  if (inVideo(e.target)) return

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextMedia()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevMedia()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    jumpRecord(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    jumpRecord(-1)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  const r = route.query.r as string | undefined
  const p = parseInt(route.query.p as string)
  if (r && posById.has(r)) go(recordList[posById.get(r)!].first + (Number.isNaN(p) ? 0 : p))
  // 首張若尚未載入完成（慢速網路），也顯示 skeleton
  if (stageImg.value && !stageImg.value.complete) imgLoading.value = true
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

useSeoMeta({ title: '照片與影片檢視 · 漏水紀錄', robots: 'noindex' })
</script>

<template>
  <div class="viewer" data-testid="lightbox">
    <!-- top bar -->
    <div class="topbar" data-testid="lightbox-topbar">
      <div class="tb-left" v-if="len">
        <button class="rail-toggle mono" data-testid="rail-toggle" :aria-expanded="railOpen" @click="railOpen = !railOpen">
          ≡ 時間軸
        </button>
        <span class="mono seq" data-testid="lightbox-seq">{{ idx + 1 }}</span>
        <span class="mono total">/ {{ len }}</span>
        <span class="mono fname">{{ mediaName(current.item) }}</span>
      </div>
      <div class="tb-right">
        <span class="mono hint">← → 附件 · ↑ ↓ 事件 · Esc 關閉</span>
        <NuxtLink to="/" class="close" data-testid="lightbox-close" aria-label="關閉">×</NuxtLink>
      </div>
    </div>

    <div v-if="!len" class="empty" data-testid="lightbox-empty">尚無照片或影片。</div>

    <div v-else class="main">
      <!-- 左欄：時間軸 rail（手機版可收合） -->
      <aside class="rail" :class="{ open: railOpen }" data-testid="lightbox-rail">
        <div class="rail-title mono">時間軸 · {{ recordList.length }} 則</div>
        <div v-for="g in railGroups" :key="g.key" class="rail-day">
          <div class="rail-day-head mono">{{ g.monthDay }} {{ g.weekday }}</div>
          <button
            v-for="e in g.entries"
            :key="e.id"
            class="rail-row"
            :class="{ active: isCurrent(e), key: e.keyEvents.length }"
            data-testid="rail-row"
            :data-record-id="e.id"
            @click="selectRecord(e)"
          >
            <span class="bar" />
            <span class="mono t">{{ formatTime(e.eventTimestamp) }}</span>
            <span class="lbl">{{ e.title || e.keyEvents[0] || '紀錄' }}</span>
            <span class="mono n">{{ e.media.length }}</span>
          </button>
        </div>
      </aside>

      <!-- 中欄：stage -->
      <section class="stage" data-testid="lightbox-stage">
        <div
          class="frame"
          :class="{ 'is-loading': imgLoading }"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <img
            v-if="currentPhoto"
            ref="stageImg"
            :src="asset(currentPhoto.web)"
            :alt="`照片 ${current.mediaIndex + 1}`"
            data-testid="lightbox-image"
            :class="{ loading: imgLoading }"
            @load="onImgLoad"
            @error="onImgLoad"
          />
          <!--
            :key 讓 Vue 在切換時重建 <video>：連續兩個影片 slide 會沿用同一個
            element，只換 src 的話上一支會繼續播（含聲音）。
            preload="none" + poster：逛的時候不預抓影片，按下播放才下載。
            playsinline：不加的話 iOS Safari 一播放就強制全螢幕，跳出 lightbox。
          -->
          <video
            v-else-if="currentVideo"
            :key="idx"
            class="stage-video"
            :src="asset(currentVideo.src)"
            :poster="asset(currentVideo.poster)"
            :style="{ aspectRatio: `${currentVideo.width} / ${currentVideo.height}` }"
            controls
            playsinline
            preload="none"
            data-testid="lightbox-video"
          />
          <div v-if="imgLoading" class="img-skeleton" data-testid="lightbox-skeleton">
            <span class="mono">載入中…</span>
          </div>
          <!-- 影片的控制列在下緣，計數改放上緣才不會擋到 -->
          <span class="mono stage-badge" :class="{ top: !!currentVideo }">
            本則 {{ current.mediaIndex + 1 }} / {{ currentMedia.length }}
          </span>
          <button class="nav prev" data-testid="lightbox-prev" :disabled="idx === 0" aria-label="上一個" @click="prevMedia">‹</button>
          <button class="nav next" data-testid="lightbox-next" :disabled="idx === len - 1" aria-label="下一個" @click="nextMedia">›</button>
        </div>
        <div class="thumbs" data-testid="lightbox-thumbs">
          <button
            v-for="(m, i) in currentMedia"
            :key="i"
            class="thumb"
            :class="{ on: i === current.mediaIndex }"
            data-testid="lightbox-thumb"
            @click="goMediaInRecord(i)"
          >
            <img :src="asset(mediaThumb(m))" :alt="`縮圖 ${i + 1}`" />
            <span v-if="m.kind === 'video'" class="thumb-play" data-testid="lightbox-thumb-video">▶</span>
          </button>
        </div>
      </section>

      <!-- 右欄：info -->
      <aside class="info" data-testid="lightbox-info">
        <div class="mono i-date">{{ formatDateTimeSlash(currentEntry!.eventTimestamp) }}</div>
        <h2 v-if="currentEntry!.title" class="i-title" data-testid="lightbox-title">{{ currentEntry!.title }}</h2>
        <div v-if="currentEntry!.keyEvents.length" class="tags">
          <span v-for="t in currentEntry!.keyEvents" :key="t" class="tag" data-testid="key-tag">
            <span class="mono kicker">關鍵</span>
            <span class="kw">{{ t }}</span>
          </span>
        </div>
        <p v-if="currentEntry!.description" class="i-desc">{{ currentEntry!.description }}</p>
        <div class="i-meta">
          <div class="mono"><span class="k">檔名</span>{{ mediaName(current.item) }}</div>
          <div class="mono"><span class="k">本則附件</span>{{ current.mediaIndex + 1 }} / {{ currentMedia.length }}</div>
          <div v-if="currentVideo" class="mono" data-testid="lightbox-video-meta">
            <span class="k">影片</span>{{ formatDuration(currentVideo.duration) }} ·
            {{ currentVideo.width }}×{{ currentVideo.height }}
          </div>
        </div>
        <div class="mono i-foot">已移除 EXIF 地理資訊 · 照片最大邊 2048px · 影片 720p 並清除 metadata</div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  /*
    固定成一個視窗高：rail 是全站紀錄清單，會越長越高，用 min-height 的話
    整頁會被 rail 撐開變成長頁面，而不是「一屏內的檢視器」。
    改成固定高 + 內部各欄自己捲。dvh 讓手機網址列收合時不會跳動。
  */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
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
  /* flex item 預設 min-height:auto 不會縮到小於內容，不設 0 的話 rail 撐爆這裡 */
  min-height: 0;
  display: flex;
  flex-wrap: wrap;
}
/*
  三欄各自捲。因為 .main 是 wrap 容器，那一行的高度會跟著最高的內容長，
  所以要明確給 max-height 才收得住。
*/
.rail,
.stage,
.info {
  max-height: 100%;
  overflow-y: auto;
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
/* 載入中：撐出最小尺寸讓 skeleton 有面積（含首張未載入時） */
.frame.is-loading {
  min-width: min(90vw, 560px);
  min-height: min(50vh, 420px);
}
.frame img,
.frame video {
  max-width: min(100%, 2048px);
  max-height: 80vh;
  object-fit: contain;
  display: block;
}
/*
  不要寫死 width：直式影片（例 720x1280）會被撐成超高的框、整個版面爆掉。
  交給上面的 max-width / max-height 加 aspect-ratio（inline style 帶入真實尺寸）
  自己收斂，橫式直式都能正確 fit 進 stage。
*/
.stage-video {
  width: auto;
  height: auto;
  background: #000;
}
.frame img.loading {
  opacity: 0;
}
.img-skeleton {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--stripe);
  border-radius: var(--r-sm);
  animation: skeleton-pulse 1.1s ease-in-out infinite;
}
.img-skeleton .mono {
  font-size: 11px;
  color: var(--muted-2);
  background: rgba(251, 251, 250, 0.8);
  padding: 2px 8px;
  border-radius: var(--r-sm);
}
@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
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
.stage-badge.top {
  top: 8px;
  bottom: auto;
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
  position: relative;
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
.thumb-play {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 8px;
  line-height: 1;
  color: #fff;
  background: rgba(20, 20, 20, 0.72);
  padding: 2px 4px;
  border-radius: var(--r-sm);
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
.i-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  margin: 0 0 12px;
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
  /*
    堆疊之後總高度本來就會超過一屏，改回整頁捲動。
    留著固定高 + overflow:hidden 的話，下面的 info 會被直接切掉看不到。
  */
  .viewer {
    height: auto;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: visible;
  }
  .rail,
  .stage,
  .info {
    max-height: none;
    overflow-y: visible;
  }
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
