
-- Create User table
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Ensure email uniqueness
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Add nullable ownership to existing documents
ALTER TABLE "Document"
ADD COLUMN "userId" TEXT;

-- Index document ownership lookups
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- Add ownership foreign key
ALTER TABLE "Document"
ADD CONSTRAINT "Document_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
