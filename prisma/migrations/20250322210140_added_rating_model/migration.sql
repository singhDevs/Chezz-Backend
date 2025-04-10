-- CreateTable
CREATE TABLE "Rating" (
    "userId" TEXT NOT NULL,
    "blitzRating" INTEGER NOT NULL DEFAULT 1500,
    "blitzRD" INTEGER NOT NULL DEFAULT 350,
    "blitzVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "bulletRating" INTEGER NOT NULL DEFAULT 1500,
    "bulletRD" INTEGER NOT NULL DEFAULT 350,
    "bulletVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "rapidRating" INTEGER NOT NULL DEFAULT 1500,
    "rapidRD" INTEGER NOT NULL DEFAULT 350,
    "rapidVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_key" ON "Rating"("userId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
