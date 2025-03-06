/*
  Warnings:

  - You are about to drop the `Move` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Move" DROP CONSTRAINT "Move_gameId_fkey";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "moves" TEXT;

-- DropTable
DROP TABLE "Move";
