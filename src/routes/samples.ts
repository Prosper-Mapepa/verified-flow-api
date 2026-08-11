import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireUser } from "../lib/auth";
import { Role, SampleStatus } from "../lib/roles";
import { prisma } from "../lib/prisma";
import { writeAudit } from "../lib/audit";
import { fail, ok } from "../lib/http";
import { publicSample } from "../lib/serialize";
import { labSampleDetail } from "../lib/sampleDetail";
import {
  combinedEvidenceHash,
  saveEvidenceFile,
  type EvidenceKind,
} from "../lib/evidence";
import { sealPayload } from "../lib/crypto";
import { alertMessage, evaluateThreshold } from "../lib/thresholds";

export const samplesRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

samplesRouter.get("/", async (req, res) => {
  try {
    const user = await requireUser(req, [Role.COLLECTOR, Role.LAB, Role.ADMIN]);
    const samples = await prisma.sample.findMany({
      where: user.role === Role.COLLECTOR ? { collectorId: user.id } : undefined,
      include: { result: true, evidence: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, { samples: samples.map(publicSample) });
  } catch (e) {
    return fail(res, e);
  }
});

samplesRouter.get("/:id", async (req, res) => {
  try {
    const user = await requireUser(req, [Role.LAB, Role.ADMIN, Role.COLLECTOR]);
    const sample = await prisma.sample.findUnique({
      where: { id: req.params.id },
      include: {
        evidence: { orderBy: { kind: "asc" } },
        collector: {
          select: { id: true, name: true, email: true, orgName: true },
        },
      },
    });
    if (!sample) throw new Error("Sample not found");
    if (user.role === Role.COLLECTOR && sample.collectorId !== user.id) {
      throw new Error("Forbidden");
    }
    return ok(res, { sample: labSampleDetail(sample) });
  } catch (e) {
    return fail(res, e);
  }
});

samplesRouter.post(
  "/",
  upload.fields([
    { name: "kitPhoto", maxCount: 1 },
    { name: "tapPhoto", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await requireUser(req, [Role.COLLECTOR]);
      const body = req.body as Record<string, string>;
      const files = req.files as {
        kitPhoto?: Express.Multer.File[];
        tapPhoto?: Express.Multer.File[];
      };

      const kitId = String(body.kitId || "").trim().toUpperCase();
      const collectedAtRaw = String(body.collectedAt || "");
      const neighborhood = String(body.neighborhood || "").trim();
      const addressText = String(body.addressText || "").trim();
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const attested = String(body.attested) === "true";
      const deviceLatitude = body.deviceLatitude ? Number(body.deviceLatitude) : null;
      const deviceLongitude = body.deviceLongitude
        ? Number(body.deviceLongitude)
        : null;
      const gpsAccuracyM = body.gpsAccuracyM ? Number(body.gpsAccuracyM) : null;

      const kitPhoto = files.kitPhoto?.[0];
      const tapPhoto = files.tapPhoto?.[0];

      if (!kitId || kitId.length < 3) throw new Error("Kit ID is required");
      if (!collectedAtRaw) throw new Error("Collected at is required");
      if (!neighborhood || !addressText) throw new Error("Location is required");
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Valid coordinates are required");
      }
      if (!attested) throw new Error("You must attest sample collection");
      if (!kitPhoto) throw new Error("Kit photo upload is required");
      if (!tapPhoto) throw new Error("Tap photo upload is required");

      const sampleId = `c${randomBytes(12).toString("hex")}`;
      const saved = [];
      for (const [kind, file] of [
        ["KIT_PHOTO", kitPhoto],
        ["TAP_PHOTO", tapPhoto],
      ] as const) {
        const fakeFile = {
          type: file.mimetype,
          size: file.size,
          arrayBuffer: async () =>
            file.buffer.buffer.slice(
              file.buffer.byteOffset,
              file.buffer.byteOffset + file.buffer.byteLength
            ),
        } as File;
        // saveEvidenceFile expects File with arrayBuffer — adapt for multer buffer
        saved.push(
          await saveEvidenceFromBuffer({
            sampleId,
            kind: kind as EvidenceKind,
            buffer: file.buffer,
            mimeType: file.mimetype || "image/jpeg",
          })
        );
        void fakeFile;
      }

      const evidenceHash = combinedEvidenceHash(saved.map((s) => s.sha256));
      const sample = await prisma.sample.create({
        data: {
          id: sampleId,
          kitId,
          collectorId: user.id,
          collectedAt: new Date(collectedAtRaw),
          latitude,
          longitude,
          deviceLatitude,
          deviceLongitude,
          gpsAccuracyM,
          addressText,
          neighborhood,
          attested,
          evidenceHash,
          evidence: {
            create: saved.map((s) => ({
              kind: s.kind,
              filename: s.filename,
              mimeType: s.mimeType,
              sizeBytes: s.sizeBytes,
              sha256: s.sha256,
              storagePath: s.storagePath,
              data: s.data,
            })),
          },
        },
        include: { result: true, evidence: true },
      });

      await writeAudit({
        actorUserId: user.id,
        action: "SAMPLE_CREATED",
        entityType: "Sample",
        entityId: sample.id,
        metadata: {
          kitId: sample.kitId,
          evidenceHash,
          evidenceCount: saved.length,
          hasDeviceGps: deviceLatitude != null && deviceLongitude != null,
        },
      });

      return ok(res, { sample: publicSample(sample) }, 201);
    } catch (e) {
      return fail(res, e);
    }
  }
);

samplesRouter.post("/:id/results", async (req, res) => {
  try {
    const user = await requireUser(req, [Role.LAB]);
    const body = z
      .object({
        leadPpb: z.number().min(0).max(10000),
        testedAt: z.string().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const sample = await prisma.sample.findUnique({
      where: { id: req.params.id },
      include: { result: true, evidence: true },
    });
    if (!sample) throw new Error("Sample not found");
    if (sample.status === SampleStatus.VOID) throw new Error("Sample is void");
    if (sample.result) throw new Error("Sample already has a sealed result");
    if (!sample.evidence.length) {
      throw new Error("Sample is missing collection evidence uploads");
    }

    const testedAt = body.testedAt ? new Date(body.testedAt) : new Date();
    const labOrgName = user.orgName || "Independent Lab";
    const sealed = sealPayload({
      sampleId: sample.id,
      kitId: sample.kitId,
      leadPpb: body.leadPpb,
      labOrgId: user.id,
      labOrgName,
      testedAt: testedAt.toISOString(),
      collectedAt: sample.collectedAt.toISOString(),
      latitude: sample.latitude,
      longitude: sample.longitude,
      neighborhood: sample.neighborhood,
      evidenceHash: sample.evidenceHash || "",
    });

    const { publicResult } = await import("../lib/serialize");
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.result.create({
        data: {
          sampleId: sample.id,
          labUserId: user.id,
          labOrgName,
          leadPpb: body.leadPpb,
          testedAt,
          notes: body.notes,
          payloadCanonical: sealed.canonical,
          payloadHash: sealed.payloadHash,
          signature: sealed.signature,
          algo: sealed.algo,
          publishedAt: new Date(),
        },
      });

      await tx.sample.update({
        where: { id: sample.id },
        data: { status: SampleStatus.COMPLETED },
      });

      const hit = evaluateThreshold(body.leadPpb);
      if (hit) {
        await tx.alert.create({
          data: {
            resultId: created.id,
            sampleId: sample.id,
            severity: hit.severity,
            thresholdPpb: hit.thresholdPpb,
            observedPpb: body.leadPpb,
            message: alertMessage(
              hit.severity,
              body.leadPpb,
              sample.neighborhood
            ),
            deliveredAt: new Date(),
          },
        });
      }

      return tx.result.findUniqueOrThrow({
        where: { id: created.id },
        include: { sample: { include: { evidence: true } }, alerts: true },
      });
    });

    await writeAudit({
      actorUserId: user.id,
      action: "RESULT_SEALED",
      entityType: "Result",
      entityId: result.id,
      metadata: { leadPpb: body.leadPpb, kitId: sample.kitId },
    });
    await writeAudit({
      actorUserId: user.id,
      action: "RESULT_PUBLISHED",
      entityType: "Result",
      entityId: result.id,
      metadata: { publishedAt: result.publishedAt.toISOString() },
    });

    const hit = evaluateThreshold(body.leadPpb);
    if (hit) {
      await writeAudit({
        actorUserId: user.id,
        action: "ALERT_FIRED",
        entityType: "Alert",
        entityId: result.alerts[0]?.id ?? result.id,
        metadata: { severity: hit.severity, leadPpb: body.leadPpb },
      });
    }

    return ok(res, { result: publicResult(result) }, 201);
  } catch (e) {
    return fail(res, e);
  }
});

async function saveEvidenceFromBuffer(params: {
  sampleId: string;
  kind: EvidenceKind;
  buffer: Buffer;
  mimeType: string;
}) {
  const { createHash, randomBytes } = await import("crypto");
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const { uploadsRoot } = await import("../lib/evidence");

  const MAX = 5 * 1024 * 1024;
  if (params.buffer.length <= 0 || params.buffer.length > MAX) {
    throw new Error(`${params.kind}: image must be under 5MB`);
  }
  if (!params.mimeType.startsWith("image/")) {
    throw new Error(`${params.kind}: only image uploads are allowed`);
  }

  const sha256 = createHash("sha256").update(params.buffer).digest("hex");
  const ext =
    params.mimeType === "image/png"
      ? "png"
      : params.mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const filename = `${params.kind.toLowerCase()}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = path.join(uploadsRoot(), params.sampleId);
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, filename);
  await writeFile(storagePath, params.buffer);
  return {
    kind: params.kind,
    filename,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.length,
    sha256,
    storagePath,
    data: params.buffer,
  };
}
