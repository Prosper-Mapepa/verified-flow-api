import { Router } from "express";
import { z } from "zod";
import { execSync } from "child_process";
import path from "path";
import { requireUser } from "../lib/auth";
import { Role } from "../lib/roles";
import { prisma } from "../lib/prisma";
import { writeAudit } from "../lib/audit";
import { verifySeal } from "../lib/crypto";
import { fail, ok } from "../lib/http";

export const adminRouter = Router();

adminRouter.get("/audit", async (req, res) => {
  try {
    await requireUser(req, [Role.ADMIN]);
    const events = await prisma.auditEvent.findMany({
      include: { actor: { select: { email: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, {
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        metadata: JSON.parse(e.metadata),
        createdAt: e.createdAt.toISOString(),
        actor: e.actor,
      })),
    });
  } catch (e) {
    return fail(res, e);
  }
});

adminRouter.get("/alert-contacts", async (req, res) => {
  try {
    await requireUser(req, [Role.ADMIN]);
    const contacts = await prisma.alertContact.findMany({
      orderBy: { email: "asc" },
    });
    return ok(res, { contacts });
  } catch (e) {
    return fail(res, e);
  }
});

adminRouter.post("/alert-contacts", async (req, res) => {
  try {
    const user = await requireUser(req, [Role.ADMIN]);
    const body = z
      .object({
        email: z.string().email(),
        label: z.string().min(2),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const contact = await prisma.alertContact.upsert({
      where: { email: body.email.toLowerCase() },
      create: {
        email: body.email.toLowerCase(),
        label: body.label,
        active: body.active ?? true,
      },
      update: { label: body.label, active: body.active ?? true },
    });
    await writeAudit({
      actorUserId: user.id,
      action: "ALERT_CONTACT_UPSERT",
      entityType: "AlertContact",
      entityId: contact.id,
      metadata: { email: contact.email },
    });
    return ok(res, { contact });
  } catch (e) {
    return fail(res, e);
  }
});

adminRouter.post("/demo/tamper", async (req, res) => {
  try {
    const user = await requireUser(req, [Role.ADMIN]);
    const body = z
      .object({
        resultId: z.string().min(1),
        fakeLeadPpb: z.number().min(0).max(10000),
      })
      .parse(req.body);

    const existing = await prisma.result.findUnique({
      where: { id: body.resultId },
    });
    if (!existing) throw new Error("Result not found");

    const before = verifySeal(
      existing.payloadCanonical,
      existing.payloadHash,
      existing.signature
    );

    const updated = await prisma.result.update({
      where: { id: body.resultId },
      data: { leadPpb: body.fakeLeadPpb },
    });

    const after = verifySeal(
      updated.payloadCanonical,
      updated.payloadHash,
      updated.signature
    );
    const canonicalLead = JSON.parse(updated.payloadCanonical).leadPpb as number;
    const displayMatchesSeal = canonicalLead === updated.leadPpb;
    const valid = after.valid && displayMatchesSeal;

    await writeAudit({
      actorUserId: user.id,
      action: "DEMO_TAMPER",
      entityType: "Result",
      entityId: updated.id,
      metadata: {
        previousLeadPpb: existing.leadPpb,
        fakeLeadPpb: body.fakeLeadPpb,
        before,
        after: {
          valid,
          reason: displayMatchesSeal
            ? after.reason
            : "Displayed lead value no longer matches sealed canonical payload.",
        },
      },
    });

    return ok(res, {
      resultId: updated.id,
      displayedLeadPpb: updated.leadPpb,
      sealedLeadPpb: canonicalLead,
      verification: {
        valid,
        reason: displayMatchesSeal
          ? after.reason
          : "Displayed lead value no longer matches sealed canonical payload.",
      },
    });
  } catch (e) {
    return fail(res, e);
  }
});

adminRouter.post("/demo/seed", async (req, res) => {
  try {
    await requireUser(req, [Role.ADMIN]);
    execSync("npx tsx prisma/seed.ts", {
      cwd: path.join(process.cwd()),
      stdio: "inherit",
      env: process.env,
    });
    return ok(res, { ok: true, message: "Database re-seeded" });
  } catch (e) {
    return fail(res, e);
  }
});
