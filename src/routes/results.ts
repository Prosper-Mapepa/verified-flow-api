import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicResult } from "../lib/serialize";
import { verifySeal } from "../lib/crypto";
import { getSession } from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { fail, ok } from "../lib/http";

export const resultsRouter = Router();

resultsRouter.get("/", async (req, res) => {
  try {
    const severity = req.query.severity as string | undefined;
    const results = await prisma.result.findMany({
      include: { sample: { include: { evidence: true } }, alerts: true },
      orderBy: { publishedAt: "desc" },
    });
    let mapped = results.map(publicResult);
    if (severity) {
      mapped = mapped.filter((r) =>
        r.alerts.some((a) => a.severity === severity)
      );
    }
    return ok(res, { results: mapped });
  } catch (e) {
    return fail(res, e);
  }
});

resultsRouter.get("/:id", async (req, res) => {
  try {
    const result = await prisma.result.findUnique({
      where: { id: req.params.id },
      include: { sample: { include: { evidence: true } }, alerts: true },
    });
    if (!result) throw new Error("Result not found");
    return ok(res, { result: publicResult(result) });
  } catch (e) {
    return fail(res, e);
  }
});

resultsRouter.post("/:id/verify", async (req, res) => {
  try {
    const result = await prisma.result.findUnique({
      where: { id: req.params.id },
    });
    if (!result) throw new Error("Result not found");
    const verification = verifySeal(
      result.payloadCanonical,
      result.payloadHash,
      result.signature
    );
    const session = await getSession(req);
    await writeAudit({
      actorUserId: session?.id,
      action: "RESULT_VERIFIED",
      entityType: "Result",
      entityId: result.id,
      metadata: verification,
    });
    return ok(res, {
      resultId: result.id,
      ...verification,
      algo: result.algo,
      payloadHash: result.payloadHash,
    });
  } catch (e) {
    return fail(res, e);
  }
});
