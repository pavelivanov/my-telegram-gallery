-- Gallery is global (admin uploads, everyone views): drop per-user ownership.

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_userId_fkey";

-- DropIndex
DROP INDEX "Photo_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "userId";

-- DropTable
DROP TABLE "User";

-- CreateIndex
CREATE INDEX "Photo_createdAt_idx" ON "Photo"("createdAt");
