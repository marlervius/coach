CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "athleteName" TEXT NOT NULL,
    "targetRace" TEXT NOT NULL,
    "vdot" DOUBLE PRECISION NOT NULL,
    "weeks" INTEGER NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "weeklyKm" DOUBLE PRECISION NOT NULL,
    "hrMax" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "planJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");
