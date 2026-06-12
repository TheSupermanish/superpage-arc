/**
 * HLS transcode service: turns an uploaded video into a 4-second-segment
 * VOD HLS stream at uploads/hls/<resourceId>/index.m3u8.
 *
 * Uses the system ffmpeg/ffprobe. If the source is already h264/aac the
 * streams are copied (fast remux); otherwise it transcodes.
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export const HLS_ROOT = path.join(process.cwd(), "uploads", "hls");
export const VIDEO_SRC_ROOT = path.join(process.cwd(), "uploads", "videos-src");

fs.mkdirSync(HLS_ROOT, { recursive: true });
fs.mkdirSync(VIDEO_SRC_ROOT, { recursive: true });

export type TranscodeState = "processing" | "ready" | "error";

interface TranscodeStatusEntry {
  status: TranscodeState;
  error?: string;
  durationSeconds?: number;
}

// Module-level status map polled via GET /stream/transcode-status/:resourceId.
// The terminal state is also persisted on the resource config so it survives
// a backend restart.
const transcodeStatus = new Map<string, TranscodeStatusEntry>();

export function getTranscodeStatus(resourceId: string): TranscodeStatusEntry | undefined {
  return transcodeStatus.get(resourceId);
}

export function setTranscodeStatus(resourceId: string, entry: TranscodeStatusEntry): void {
  transcodeStatus.set(resourceId, entry);
}

interface ProbeResult {
  durationSeconds: number;
  videoCodec: string | null;
  audioCodec: string | null;
}

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Probe duration and codecs with ffprobe. */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { code, stdout, stderr } = await run(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-show_entries", "stream=codec_name,codec_type",
    "-of", "json",
    filePath,
  ]);

  if (code !== 0) {
    throw new Error(`ffprobe failed (${code}): ${stderr.slice(0, 500)}`);
  }

  const parsed = JSON.parse(stdout);
  const durationSeconds = Math.max(0, Math.round(parseFloat(parsed?.format?.duration || "0")));
  if (!durationSeconds) {
    throw new Error("Could not determine video duration");
  }

  let videoCodec: string | null = null;
  let audioCodec: string | null = null;
  for (const stream of parsed?.streams || []) {
    if (stream.codec_type === "video" && !videoCodec) videoCodec = stream.codec_name || null;
    if (stream.codec_type === "audio" && !audioCodec) audioCodec = stream.codec_name || null;
  }
  if (!videoCodec) {
    throw new Error("File has no video stream");
  }

  return { durationSeconds, videoCodec, audioCodec };
}

/**
 * Transcode (or remux) srcPath into uploads/hls/<resourceId>/index.m3u8.
 * Returns the probed duration in seconds. Throws on failure; the caller is
 * responsible for updating the status map.
 */
export async function transcodeToHls(srcPath: string, resourceId: string): Promise<{ durationSeconds: number }> {
  const probe = await probeVideo(srcPath);

  const outDir = path.join(HLS_ROOT, resourceId);
  fs.mkdirSync(outDir, { recursive: true });

  const copyVideo = probe.videoCodec === "h264";
  const copyAudio = probe.audioCodec === null || probe.audioCodec === "aac";

  const args: string[] = ["-y", "-i", srcPath];
  if (copyVideo) {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23");
  }
  if (probe.audioCodec) {
    if (copyAudio) {
      args.push("-c:a", "copy");
    } else {
      args.push("-c:a", "aac", "-b:a", "128k");
    }
  } else {
    args.push("-an");
  }
  args.push(
    "-hls_time", "4",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(outDir, "seg_%04d.ts"),
    path.join(outDir, "index.m3u8"),
  );

  console.log(`[hls-transcode] ${resourceId}: ${copyVideo ? "remux" : "transcode"} (${probe.videoCodec}/${probe.audioCodec ?? "no-audio"}), ${probe.durationSeconds}s`);

  const { code, stderr } = await run(FFMPEG, args);
  if (code !== 0) {
    // Clean up partial output so a retry starts fresh
    fs.rmSync(outDir, { recursive: true, force: true });
    throw new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`);
  }

  if (!fs.existsSync(path.join(outDir, "index.m3u8"))) {
    throw new Error("ffmpeg finished but produced no playlist");
  }

  return { durationSeconds: probe.durationSeconds };
}
