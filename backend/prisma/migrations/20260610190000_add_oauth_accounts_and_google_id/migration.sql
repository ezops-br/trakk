-- AlterTable: add google_id, drop google_refresh_token
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
ALTER TABLE "users" DROP COLUMN IF EXISTS "google_refresh_token";

-- CreateIndex: google_id unique
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateTable: oauth_accounts
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: oauth_accounts unique constraints
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "oauth_accounts"("user_id", "provider");
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_id_key" ON "oauth_accounts"("provider", "provider_id");
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
