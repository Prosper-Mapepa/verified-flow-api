import { Router } from "express";
import { prisma } from "../lib/prisma";
import { fail, ok } from "../lib/http";

export const alertsRouter = Router();

alertsRouter.get("/", async (_req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        sample: { select: { neighborhood: true, kitId: true } },
        result: { select: { id: true, leadPpb: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(res, {
      alerts: alerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        thresholdPpb: a.thresholdPpb,
        observedPpb: a.observedPpb,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
        neighborhood: a.sample.neighborhood,
        kitId: a.sample.kitId,
        resultId: a.result.id,
      })),
    });
  } catch (e) {
    return fail(res, e);
  }
});
