-- Manual photo ordering within an album.

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep the current display order (newest first) as the initial manual order.
UPDATE "Photo" SET "position" = ranked.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "albumId" ORDER BY "createdAt" DESC) AS rn
  FROM "Photo"
) ranked
WHERE "Photo"."id" = ranked."id";

-- DropIndex
DROP INDEX "Photo_albumId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Photo_albumId_position_idx" ON "Photo"("albumId", "position");
