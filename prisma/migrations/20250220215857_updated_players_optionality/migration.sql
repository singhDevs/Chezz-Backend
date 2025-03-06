-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_blackPlayerId_fkey";

-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_whitePlayerId_fkey";

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "whitePlayerId" DROP NOT NULL,
ALTER COLUMN "blackPlayerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_whitePlayerId_fkey" FOREIGN KEY ("whitePlayerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_blackPlayerId_fkey" FOREIGN KEY ("blackPlayerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
