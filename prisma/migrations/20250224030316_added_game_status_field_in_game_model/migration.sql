-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PENDING', 'ONGOING', 'COMPLETED', 'ABANDONED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "status" "GameStatus" NOT NULL DEFAULT 'PENDING';
