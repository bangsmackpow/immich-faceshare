import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { people, assetCache } from "../db/schema.js";
import { getImmichClient } from "./immich.js";
import { logger } from "./logger.js";
import { eq } from "drizzle-orm";

export async function syncPerson(personId: string, options?: { backfillExif?: boolean }): Promise<{
  newAssets: number;
  updatedExif: number;
}> {
  const db = getDb();
  const immich = getImmichClient();

  const person = db
    .select()
    .from(people)
    .where(eq(people.id, personId))
    .limit(1)
    .all()[0];

  if (!person) {
    throw new Error(`Person not found in cache: ${personId}`);
  }

  const afterDate = options?.backfillExif
    ? undefined
    : person.syncDate
      ? new Date(person.syncDate).toISOString()
      : undefined;

  logger.info(
    { personId: person.immichPersonId, afterDate, backfillExif: options?.backfillExif },
    "syncing person",
  );

  const searchRes = await immich.searchAssetsByPerson(
    person.immichPersonId,
    afterDate,
  );

  let newAssets = 0;
  let updatedExif = 0;
  const thumbBaseUrl = (process.env.IMMICH_URL ?? "").replace(/\/+$/, "");

  for (const asset of searchRes.assets.items) {
    const existing = db
      .select({ id: assetCache.id, exif: assetCache.exif })
      .from(assetCache)
      .where(eq(assetCache.immichAssetId, asset.id))
      .limit(1)
      .all()[0];

    if (!existing) {
      db.insert(assetCache)
        .values({
          id: randomUUID(),
          immichAssetId: asset.id,
          personId: person.id,
          thumbnailUrl: `${thumbBaseUrl}/api/assets/${asset.id}/thumbnail?format=JPEG`,
          exif: asset.exifInfo ? JSON.stringify(asset.exifInfo) : null,
          createdAt: new Date(),
        })
        .run();
      newAssets++;
    } else if (options?.backfillExif && !existing.exif && asset.exifInfo) {
      db.update(assetCache)
        .set({ exif: JSON.stringify(asset.exifInfo) })
        .where(eq(assetCache.id, existing.id))
        .run();
      updatedExif++;
    }
  }

  const now = new Date();
  db.update(people)
    .set({ syncDate: now, assetCount: searchRes.assets.total })
    .where(eq(people.id, personId))
    .run();

  logger.info(
    { personId: person.immichPersonId, newAssets, updatedExif, total: searchRes.assets.total },
    "sync complete",
  );

  return { newAssets, updatedExif };
}

export async function syncAllPeople(): Promise<{
  synced: number;
  totalAssets: number;
}> {
  const db = getDb();
  const immich = getImmichClient();

  const allPeople = await immich.getPeople();

  let synced = 0;
  let totalAssets = 0;

  for (const ip of allPeople.people) {
    const existing = db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.immichPersonId, ip.id))
      .limit(1)
      .all()[0];

    if (!existing) {
      db.insert(people)
        .values({
          id: randomUUID(),
          immichPersonId: ip.id,
          name: ip.name || `Person ${ip.id.slice(0, 8)}`,
          thumbnailUrl: ip.thumbnailPath || null,
          assetCount: ip.assetCount,
          syncDate: null,
          createdAt: new Date(),
        })
        .run();
    }
  }

  const allCached = db.select().from(people).all();

  for (const p of allCached) {
    const result = await syncPerson(p.id);
    synced++;
    totalAssets += result.newAssets;
  }

  return { synced, totalAssets };
}

export function searchPeopleFts(query: string) {
  const db = getDb();
  const client = (db as any).$client;

  const sanitized = query.replace(/['"]/g, "").trim();
  if (!sanitized) {
    return db.select().from(people).all();
  }

  const escaped = sanitized.replace(/\*/g, "") + "*";
  const ftsResults = client
    .prepare("SELECT rowid FROM people_fts WHERE people_fts MATCH ? ORDER BY rank LIMIT 50")
    .all(escaped) as { rowid: number }[];

  if (ftsResults.length === 0) {
    return db.select().from(people).all();
  }

  const rowids = ftsResults.map((r: { rowid: number }) => r.rowid);
  const placeholders = rowids.map(() => "?").join(",");
  const ftsPeople = client
    .prepare(`SELECT * FROM people WHERE rowid IN (${placeholders})`)
    .all(...rowids);

  return ftsPeople;
}
