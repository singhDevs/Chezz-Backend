/*
  Warnings:

  - The `gameType` column on the `Game` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('RATED', 'CASUAL');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('BULLET', 'BLITZ', 'RAPID');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "gameMode" "GameMode",
DROP COLUMN "gameType",
ADD COLUMN     "gameType" "GameType";
