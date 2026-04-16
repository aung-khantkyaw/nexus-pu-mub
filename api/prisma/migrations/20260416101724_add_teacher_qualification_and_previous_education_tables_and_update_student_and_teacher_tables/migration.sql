/*
  Warnings:

  - You are about to drop the column `previousEducation` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `qualification` on the `Teacher` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudentStatus" ADD VALUE 'PROBATION';
ALTER TYPE "StudentStatus" ADD VALUE 'DEFERRED';
ALTER TYPE "StudentStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "previousEducation";

-- AlterTable
ALTER TABLE "Teacher" DROP COLUMN "qualification";

-- CreateTable
CREATE TABLE "TeacherQualification" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviousEducation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviousEducation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherQualification_teacherId_idx" ON "TeacherQualification"("teacherId");

-- CreateIndex
CREATE INDEX "PreviousEducation_studentId_idx" ON "PreviousEducation"("studentId");

-- AddForeignKey
ALTER TABLE "TeacherQualification" ADD CONSTRAINT "TeacherQualification_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviousEducation" ADD CONSTRAINT "PreviousEducation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
