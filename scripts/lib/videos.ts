/**
 * 影片處理（github 上的網頁副本），需要系統有 ffmpeg / ffprobe。
 *
 * 為什麼一定要轉：手機直出多半是 HEVC（實測 Pixel 10 = hevc 1080p 20Mbps），
 * Firefox 完全播不動，而且 18 秒就 45MB。轉成 720p H.264 後約 1.2MB。
 *
 * 轉檔時的三個重點：
 * - `-map_metadata -1` 清掉全部 metadata，含手機可能寫入的 GPS（對應照片的去 EXIF 政策）
 * - `-map 0:v:0` 只留主影像軌，丟掉 Pixel 的 `mett` 感測器資料軌
 * - `-movflags +faststart` 把 moov 搬到檔頭，網頁才能邊下載邊播
 * ffmpeg 濾鏡預設會套用 rotation matrix，所以直式影片轉出來就是正的。
 *
 * 原檔不經這裡處理（保留完整 metadata 進 Drive 當存檔）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { DateTime } from 'luxon';
import { IMG_DIR } from './config.ts';
import { seqPad } from './media.ts';
import type { DownloadedFile } from './download.ts';
import type { VideoMedia } from './types.ts';

const run = promisify(execFile);

/** 長邊上限（720p 等級） */
const VIDEO_MAX = 1280;
/** x264 品質，數字越大檔案越小；28 在這種靜態畫面的紀錄影片上肉眼無損 */
const CRF = 28;
/**
 * poster 長邊。跟影片同尺寸，因為 <video> 在 metadata 載入前（preload="none"）
 * 是用 poster 的原始尺寸決定版面大小的，poster 給 600 影片就只會顯示 600 寬。
 */
const POSTER_MAX = VIDEO_MAX;
/** 縮圖長邊，與照片 thumb 一致 */
const THUMB_MAX = 600;
/** 單支影片的轉檔時間上限 */
const TIMEOUT_MS = 10 * 60 * 1000;

const SCALE = (max: number): string =>
  `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;

/** 待處理的影片：已落地成暫存檔（ffmpeg/ffprobe 只吃檔案），附原始拍攝時間 */
export interface VideoSource {
  seq: number;
  filename: string;
  tmpPath: string;
  /** 原檔 metadata 的拍攝時間，讀不到為 null */
  createdAt: DateTime | null;
}

function ffError(cmd: string, e: unknown): Error {
  const err = e as { code?: string; stderr?: string; message?: string };
  if (err.code === 'ENOENT') {
    return new Error(`找不到 ${cmd}，請先安裝 ffmpeg（CI 需在 workflow 加安裝步驟）`);
  }
  // stderr 會寫進 Airtable 的「同步錯誤」欄給人看，只留最後幾行
  const tail = (err.stderr ?? err.message ?? '').trim().split('\n').slice(-3).join(' / ');
  return new Error(`${cmd} 失敗: ${tail}`);
}

async function ffprobeJson(path: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (e) {
    throw ffError('ffprobe', e);
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run('ffmpeg', ['-v', 'error', '-y', ...args], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: TIMEOUT_MS,
    });
  } catch (e) {
    throw ffError('ffmpeg', e);
  }
}

/**
 * 從 mp4 metadata 取拍攝時間。
 * - iPhone 的 `com.apple.quicktime.creationdate` 自帶時區偏移，優先用
 * - 一般的 `creation_time` 依 mp4 規格是 UTC（實測 Pixel 也是），轉成 UTC+8 由呼叫端處理
 */
function parseCreationTime(tags: Record<string, string> | undefined): DateTime | null {
  if (!tags) return null;
  const apple = tags['com.apple.quicktime.creationdate'];
  if (apple) {
    const dt = DateTime.fromISO(apple, { setZone: true });
    if (dt.isValid) return dt;
  }
  const raw = tags.creation_time;
  if (raw) {
    const dt = DateTime.fromISO(raw, { zone: 'utc' });
    // 有些相機寫 1904/1970 的預設值，當成沒有
    if (dt.isValid && dt.year > 2000) return dt;
  }
  return null;
}

/**
 * 把影片落地成暫存檔並讀出拍攝時間。
 * 先做這步是因為事件時間要在轉檔（很慢）之前就決定 —— 缺時間的紀錄會直接跳過。
 * 用完務必呼叫 cleanupVideos()。
 */
export async function loadVideos(
  items: { file: DownloadedFile; seq: number }[],
): Promise<VideoSource[]> {
  if (items.length === 0) return [];
  const dir = await mkdtemp(join(tmpdir(), 'leak-log-'));
  const out: VideoSource[] = [];
  for (const { file, seq } of items) {
    const tmpPath = join(dir, `${seqPad(seq)}${extname(file.filename) || '.mp4'}`);
    await writeFile(tmpPath, file.buffer);
    const probe = await ffprobeJson(tmpPath);
    const format = probe.format as { tags?: Record<string, string> } | undefined;
    out.push({
      seq,
      filename: file.filename,
      tmpPath,
      createdAt: parseCreationTime(format?.tags),
    });
  }
  return out;
}

/** 刪掉 loadVideos 建立的暫存目錄；失敗不影響主流程 */
export async function cleanupVideos(sources: VideoSource[]): Promise<void> {
  if (sources.length === 0) return;
  // 同一批共用一個 mkdtemp 目錄，砍掉父層即可
  const dir = join(sources[0].tmpPath, '..');
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * 轉檔並輸出到 public/img/{recordId}/video/{NN}.{mp4,jpg}。
 * 呼叫前必須先 clearRecordMedia()。回傳相對站台根的路徑。
 */
export async function transcodeVideos(
  recordId: string,
  sources: VideoSource[],
): Promise<VideoMedia[]> {
  if (sources.length === 0) return [];
  const dir = join(IMG_DIR, recordId, 'video');
  await mkdir(dir, { recursive: true });

  const out: VideoMedia[] = [];
  for (const s of sources) {
    const n = seqPad(s.seq);
    const mp4 = join(dir, `${n}.mp4`);
    const jpg = join(dir, `${n}.jpg`);
    const thumbJpg = join(dir, `${n}.thumb.jpg`);

    await ffmpeg([
      '-i', s.tmpPath,
      '-map_metadata', '-1',
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', SCALE(VIDEO_MAX),
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-crf', String(CRF),
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '1',
      '-movflags', '+faststart',
      mp4,
    ]);

    // 尺寸與長度讀轉檔後的檔案：直式影片經 autorotate 後長寬會對調，讀原檔會拿到錯的值
    const probe = await ffprobeJson(mp4);
    const streams = (probe.streams ?? []) as Array<Record<string, unknown>>;
    const v = streams.find((st) => st.codec_type === 'video');
    const duration = Number((probe.format as { duration?: string })?.duration ?? 0);
    const width = Number(v?.width ?? 0);
    const height = Number(v?.height ?? 0);

    // 封面幀取 1 秒處（避開開頭常見的黑幀 / 對焦中畫面），短片就取正中間
    const posterAt = duration > 2 ? 1 : Math.max(0, duration / 2);
    for (const [out, max] of [[jpg, POSTER_MAX], [thumbJpg, THUMB_MAX]] as const) {
      await ffmpeg([
        '-ss', posterAt.toFixed(2),
        '-i', mp4,
        '-frames:v', '1',
        '-vf', SCALE(max),
        '-q:v', '3',
        out,
      ]);
    }

    const bytes = (await stat(mp4)).size;
    console.log(
      `  ↳ 影片 ${s.filename} → ${n}.mp4 ${width}x${height} ` +
        `${duration.toFixed(1)}s ${(bytes / 1024 / 1024).toFixed(1)}MB`,
    );

    out.push({
      kind: 'video',
      seq: s.seq,
      src: `img/${recordId}/video/${n}.mp4`,
      poster: `img/${recordId}/video/${n}.jpg`,
      thumb: `img/${recordId}/video/${n}.thumb.jpg`,
      duration: Math.round(duration * 10) / 10,
      width,
      height,
    });
  }
  return out;
}
