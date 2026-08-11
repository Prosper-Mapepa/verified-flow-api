import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { sealPayload } from "../src/lib/crypto";
import { alertMessage, evaluateThreshold } from "../src/lib/thresholds";
import { Role, SampleStatus } from "../src/lib/roles";
import {
  combinedEvidenceHash,
  hashBuffer,
  uploadsRoot,
} from "../src/lib/evidence";

const prisma = new PrismaClient();

/** Tiny solid-color PNG so demos have real image evidence. */
function tinyPng(r: number, g: number, b: number) {
  // 1x1 PNG
  const raw = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, r, g, b, 0x00, 0x00, 0x00,
    0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  // Use a unique buffer per call by appending RGB comment via different pixel bytes in IDAT-ish way:
  // Simpler: just hash distinct text-wrapped pseudo images.
  return Buffer.concat([raw, Buffer.from(`vf-${r}-${g}-${b}-${Date.now()}`)]);
}

async function attachEvidence(sampleId: string, kitId: string) {
  const dir = path.join(uploadsRoot(), sampleId);
  await mkdir(dir, { recursive: true });

  const files = [
    {
      kind: "KIT_PHOTO",
      filename: "kit-photo.png",
      buf: tinyPng(20, 140, 140),
    },
    {
      kind: "TAP_PHOTO",
      filename: "tap-photo.png",
      buf: tinyPng(11, 43, 64),
    },
  ] as const;

  const saved = [];
  for (const f of files) {
    const storagePath = path.join(dir, f.filename);
    await writeFile(storagePath, f.buf);
    const sha256 = hashBuffer(f.buf);
    saved.push({
      kind: f.kind,
      filename: f.filename,
      mimeType: "image/png",
      sizeBytes: f.buf.length,
      sha256,
      storagePath,
    });
  }

  const evidenceHash = combinedEvidenceHash(saved.map((s) => s.sha256));
  await prisma.sampleEvidence.createMany({
    data: saved.map((s) => ({ ...s, sampleId })),
  });
  await prisma.sample.update({
    where: { id: sampleId },
    data: {
      evidenceHash,
      deviceLatitude: 43.02 + Math.random() * 0.01,
      deviceLongitude: -83.69 + Math.random() * 0.01,
      gpsAccuracyM: 12,
    },
  });
  return evidenceHash;
}

async function main() {
  await prisma.alert.deleteMany();
  await prisma.result.deleteMany();
  await prisma.sampleEvidence.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.alertContact.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@verifiedflow.local",
      passwordHash,
      name: "Partner Admin",
      role: Role.ADMIN,
      orgName: "Great Lakes Water Trust",
    },
  });

  const collector = await prisma.user.create({
    data: {
      email: "collector@verifiedflow.local",
      passwordHash,
      name: "Maya Cole",
      role: Role.COLLECTOR,
      orgName: "Flint Neighborhood Network",
    },
  });

  const lab = await prisma.user.create({
    data: {
      email: "lab@verifiedflow.local",
      passwordHash,
      name: "Dr. Aaron Lee",
      role: Role.LAB,
      orgName: "Independent Lakes Lab",
    },
  });

  await prisma.alertContact.create({
    data: {
      email: "alerts@verifiedflow.local",
      label: "Community Partner Desk",
      active: true,
    },
  });

  const scenarios = [
    {
      kitId: "VF-FLINT-001",
      leadPpb: 3.2,
      neighborhood: "Carriage Town",
      addressText: "1232 Garland St, Flint, MI",
      lat: 43.0215,
      lng: -83.6962,
      daysAgo: 6,
    },
    {
      kitId: "VF-FLINT-002",
      leadPpb: 7.0,
      neighborhood: "Civic Park",
      addressText: "1801 N Saginaw St, Flint, MI",
      lat: 43.0312,
      lng: -83.6871,
      daysAgo: 3,
    },
    {
      kitId: "VF-FLINT-003",
      leadPpb: 12.4,
      neighborhood: "South Flint",
      addressText: "2408 S Dort Hwy, Flint, MI",
      lat: 42.9958,
      lng: -83.6554,
      daysAgo: 1,
    },
  ];

  for (const s of scenarios) {
    const collectedAt = new Date(Date.now() - s.daysAgo * 86400000);
    const testedAt = new Date(collectedAt.getTime() + 36 * 3600000);

    const sample = await prisma.sample.create({
      data: {
        kitId: s.kitId,
        collectorId: collector.id,
        collectedAt,
        latitude: s.lat,
        longitude: s.lng,
        addressText: s.addressText,
        neighborhood: s.neighborhood,
        attested: true,
        status: SampleStatus.COMPLETED,
      },
    });

    const evidenceHash = await attachEvidence(sample.id, s.kitId);

    const sealed = sealPayload({
      sampleId: sample.id,
      kitId: sample.kitId,
      leadPpb: s.leadPpb,
      labOrgId: lab.id,
      labOrgName: lab.orgName!,
      testedAt: testedAt.toISOString(),
      collectedAt: collectedAt.toISOString(),
      latitude: s.lat,
      longitude: s.lng,
      neighborhood: s.neighborhood,
      evidenceHash,
    });

    const result = await prisma.result.create({
      data: {
        sampleId: sample.id,
        labUserId: lab.id,
        labOrgName: lab.orgName!,
        leadPpb: s.leadPpb,
        testedAt,
        notes: "EPA Method 200.8 equivalent demo entry",
        payloadCanonical: sealed.canonical,
        payloadHash: sealed.payloadHash,
        signature: sealed.signature,
        algo: sealed.algo,
        publishedAt: testedAt,
      },
    });

    const hit = evaluateThreshold(s.leadPpb);
    if (hit) {
      await prisma.alert.create({
        data: {
          resultId: result.id,
          sampleId: sample.id,
          severity: hit.severity,
          thresholdPpb: hit.thresholdPpb,
          observedPpb: s.leadPpb,
          message: alertMessage(hit.severity, s.leadPpb, s.neighborhood),
          deliveredAt: testedAt,
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        actorUserId: lab.id,
        action: "RESULT_SEALED",
        entityType: "Result",
        entityId: result.id,
        metadata: JSON.stringify({
          leadPpb: s.leadPpb,
          kitId: s.kitId,
          evidenceHash,
        }),
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorUserId: lab.id,
        action: "RESULT_PUBLISHED",
        entityType: "Result",
        entityId: result.id,
        metadata: JSON.stringify({ publishedAt: testedAt.toISOString() }),
      },
    });

    if (hit) {
      await prisma.auditEvent.create({
        data: {
          actorUserId: lab.id,
          action: "ALERT_FIRED",
          entityType: "Alert",
          entityId: result.id,
          metadata: JSON.stringify({
            severity: hit.severity,
            leadPpb: s.leadPpb,
          }),
        },
      });
    }
  }

  const open = await prisma.sample.create({
    data: {
      kitId: "VF-FLINT-004",
      collectorId: collector.id,
      collectedAt: new Date(),
      latitude: 43.0122,
      longitude: -83.687,
      addressText: "615 S Saginaw St, Flint, MI",
      neighborhood: "Downtown Flint",
      attested: true,
      status: SampleStatus.AWAITING_LAB,
    },
  });
  await attachEvidence(open.id, open.kitId);

  await prisma.auditEvent.create({
    data: {
      actorUserId: admin.id,
      action: "DEMO_SEEDED",
      entityType: "System",
      entityId: "seed",
      metadata: JSON.stringify({ users: 3, sealedResults: 3, withEvidence: true }),
    },
  });

  console.log("Seed complete.");
  console.log("Logins (password: password123):");
  console.log("  admin@verifiedflow.local");
  console.log("  collector@verifiedflow.local");
  console.log("  lab@verifiedflow.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
