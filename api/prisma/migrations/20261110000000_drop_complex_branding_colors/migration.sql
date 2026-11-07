-- Drop per-complex branding colors (the web app now uses a fixed black/white theme).
ALTER TABLE "complexes" DROP COLUMN "primary_color",
DROP COLUMN "secondary_color";
