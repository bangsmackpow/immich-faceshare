import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import { getDb } from "../db/index.js";
import { downloadJobs, assetCache, people } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendDownloadReadyNotification } from "./email.js";
import { createSignedDownloadUrl } from "./signing.js";

interface QueueJob {
  jobId: string;
  userId: string;
  personId: string;
  assetIds: string[];
  userEmail: string;
}

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? "/data/downloads";

if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const queue: QueueJob[] = [];
let processing = false;

function getImmichAssetUrl(assetId: string): string {
  const base = process.env.IMMICH_URL?.replace(/\/+$/, "");
  return `${base}/api/assets/${assetId}/original`;
}

function getImmichApiKey(): string {
  return process.env.IMMICH_API_KEY ?? "";
}

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  const job = queue.shift()!;
  const db = getDb();
  const start = Date.now();

  try {
    db.update(downloadJobs)
      .set({ status: "processing" })
      .where(eq(downloadJobs.id, job.jobId))
      .run();

    const zipPath = join(DOWNLOADS_DIR, `${job.jobId}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.pipe(output);
    let downloaded = 0;
    let failed = 0;

    for (const assetId of job.assetIds) {
      try {
        const url = getImmichAssetUrl(assetId);
        const res = await fetch(url, {
          headers: { "x-api-key": getImmichApiKey() },
        });

        if (!res.ok) {
          failed++;
          logger.warn({ assetId, status: res.status }, "download failed");
          continue;
        }

        const ext = res.headers.get("content-type")?.split("/")[1] ?? "jpg";
        archive.append(Buffer.from(await res.arrayBuffer()), {
          name: `${assetId.slice(0, 8)}.${ext}`,
        });
        downloaded++;
      } catch (err) {
        failed++;
        logger.error(err, "download failed for asset");
      }
    }

    await archive.finalize();
    await new Promise<void>((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86_400_000);

    const person = db
      .select({ name: people.name })
      .from(people)
      .where(eq(people.id, job.personId))
      .limit(1)
      .all()[0];

    db.update(downloadJobs)
      .set({
        status: "completed",
        zipPath,
        expiresAt,
      })
      .where(eq(downloadJobs.id, job.jobId))
      .run();

    await sendDownloadReadyNotification(
      job.userEmail,
      person?.name ?? "this person",
      expiresAt.toISOString(),
    );

    logger.info(
      {
        jobId: job.jobId,
        downloaded,
        failed,
        elapsed: Date.now() - start,
      },
      "download job completed",
    );
  } catch (err) {
    logger.error(err, "download job failed");
    db.update(downloadJobs)
      .set({ status: "failed", error: (err as Error).message })
      .where(eq(downloadJobs.id, job.jobId))
      .run();
  } finally {
    processing = false;
    setImmediate(processQueue);
  }
}

export function enqueueDownload(
  userId: string,
  personId: string,
  assetIds: string[],
  userEmail: string,
): string {
  const jobId = randomUUID();

  const db = getDb();
  db.insert(downloadJobs)
    .values({
      id: jobId,
      userId,
      personId,
      status: "pending",
      zipPath: null,
      expiresAt: null,
      error: null,
      createdAt: new Date(),
    })
    .run();

  queue.push({ jobId, userId, personId, assetIds, userEmail });

  logger.info(
    { jobId, userId, personId, assetCount: assetIds.length },
    "download enqueued",
  );

  setImmediate(processQueue);

  return jobId;
}

export function serveDownload(jobId: string): { path: string; expiresAt: Date } | null {
  const db = getDb();

  const job = db
    .select()
    .from(downloadJobs)
    .where(
      and(eq(downloadJobs.id, jobId), eq(downloadJobs.status, "completed")),
    )
    .limit(1)
    .all()[0];

  if (!job || !job.zipPath || !job.expiresAt) return null;
  if (new Date() > job.expiresAt) {
    unlinkSync(job.zipPath);
    db.update(downloadJobs)
      .set({ status: "failed", error: "Download expired" })
      .where(eq(downloadJobs.id, jobId))
      .run();
    return null;
  }

  return { path: job.zipPath, expiresAt: job.expiresAt };
}

export { queue as jobQueue };
