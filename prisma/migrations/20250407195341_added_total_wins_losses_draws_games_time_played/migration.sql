-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalDraws" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTimePlayed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalWins" INTEGER NOT NULL DEFAULT 0;
