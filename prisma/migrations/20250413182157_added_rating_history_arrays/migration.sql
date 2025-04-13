-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "blitzRatingHistory" JSONB[] DEFAULT ARRAY[]::JSONB[],
ADD COLUMN     "bulletRatingHistory" JSONB[] DEFAULT ARRAY[]::JSONB[],
ADD COLUMN     "rapidRatingHistory" JSONB[] DEFAULT ARRAY[]::JSONB[];
