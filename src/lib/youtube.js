/**
 * Small YouTube helpers for lesson cards.
 *
 * The API stores `video_duration` as whole seconds (int), but rows created
 * before that may carry an ISO-8601 duration ("PT1H2M3S"), so fmtDur handles
 * both plus already-formatted "12:34" strings.
 */

const ID_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
];

/** Extract an 11-character YouTube video id from any URL / iframe string. */
export function youTubeId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const pattern of ID_PATTERNS) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return "";
}

/** Thumbnail URL for a video, or "" when no id can be recovered. */
export function thumbUrl(input) {
  const id = youTubeId(input);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

/** Seconds / ISO-8601 / "m:ss" → "4:05" (or "1:04:05"). */
export function fmtDur(value) {
  let seconds = NaN;

  if (typeof value === "number") {
    seconds = value;
  } else {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^P/i.test(text)) {
      const match = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      if (match) {
        seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
      }
    } else if (text.includes(":")) {
      return text; // already human formatted
    } else {
      seconds = Number(text);
    }
  }

  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
