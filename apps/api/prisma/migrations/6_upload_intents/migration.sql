CREATE TYPE "UploadIntentStatus" AS ENUM ('PENDING', 'UPLOADED', 'CONFIRMED', 'EXPIRED', 'FAILED');

CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "expectedMimeType" TEXT NOT NULL,
    "expectedSize" INTEGER NOT NULL,
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "photoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadIntent_key_key" ON "UploadIntent"("key");
CREATE UNIQUE INDEX "UploadIntent_photoId_key" ON "UploadIntent"("photoId");
CREATE INDEX "UploadIntent_status_expiresAt_idx" ON "UploadIntent"("status", "expiresAt");
CREATE INDEX "UploadIntent_albumId_idx" ON "UploadIntent"("albumId");

ALTER TABLE "UploadIntent"
ADD CONSTRAINT "UploadIntent_albumId_fkey"
FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadIntent"
ADD CONSTRAINT "UploadIntent_photoId_fkey"
FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
