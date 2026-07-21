-- CreateTable
CREATE TABLE "WorkoutCompletion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "workoutDate" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutCompletion_programId_workoutDate_key"
ON "WorkoutCompletion"("programId", "workoutDate");

-- CreateIndex
CREATE INDEX "WorkoutCompletion_programId_idx"
ON "WorkoutCompletion"("programId");

-- AddForeignKey
ALTER TABLE "WorkoutCompletion"
ADD CONSTRAINT "WorkoutCompletion_programId_fkey"
FOREIGN KEY ("programId") REFERENCES "Program"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
