/*
  Warnings:

  - Made the column `access_token_enc` on table `oauth_accounts` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "oauth_accounts" ALTER COLUMN "access_token_enc" SET NOT NULL;
