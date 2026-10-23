-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "taskIds" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiProposal_userId_createdAt_idx" ON "AiProposal"("userId", "createdAt");
