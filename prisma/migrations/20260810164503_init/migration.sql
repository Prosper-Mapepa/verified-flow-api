-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "orgName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kitId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "deviceLatitude" REAL,
    "deviceLongitude" REAL,
    "gpsAccuracyM" REAL,
    "addressText" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "attested" BOOLEAN NOT NULL DEFAULT false,
    "evidenceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_LAB',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sample_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SampleEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sampleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SampleEvidence_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sampleId" TEXT NOT NULL,
    "labUserId" TEXT NOT NULL,
    "labOrgName" TEXT NOT NULL,
    "leadPpb" REAL NOT NULL,
    "testedAt" DATETIME NOT NULL,
    "notes" TEXT,
    "payloadCanonical" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "algo" TEXT NOT NULL DEFAULT 'HMAC-SHA256',
    "status" TEXT NOT NULL DEFAULT 'SEALED',
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Result_labUserId_fkey" FOREIGN KEY ("labUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "thresholdPpb" REAL NOT NULL,
    "observedPpb" REAL NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "Alert_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alert_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_kitId_key" ON "Sample"("kitId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_sampleId_key" ON "Result"("sampleId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertContact_email_key" ON "AlertContact"("email");
