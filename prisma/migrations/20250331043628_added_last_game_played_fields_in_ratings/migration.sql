/*
  Warnings:

  - You are about to drop the `ID` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "lastBlitzGameDate" TIMESTAMP(3),
ADD COLUMN     "lastBulletGameDate" TIMESTAMP(3),
ADD COLUMN     "lastRapidGameDate" TIMESTAMP(3);

-- DropTable
DROP TABLE "ID";
