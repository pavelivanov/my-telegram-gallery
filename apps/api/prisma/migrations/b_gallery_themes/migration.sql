-- Gallery appearance is deliberately constrained to server-known presets.
-- Existing tenants retain the original dark gallery without an outage.
CREATE TYPE "GalleryTheme" AS ENUM ('NOCTURNE', 'PAPER', 'MOSS');

ALTER TABLE "Tenant"
ADD COLUMN "theme" "GalleryTheme" NOT NULL DEFAULT 'NOCTURNE';
