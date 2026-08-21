-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme_preference" TEXT NOT NULL DEFAULT 'light';
