import { Router } from "express";
import { readFile } from "fs/promises";
import { getSession } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const evidenceRouter = Router();

evidenceRouter.get("/:id", async (req, res) => {
  const evidence = await prisma.sampleEvidence.findUnique({
    where: { id: req.params.id },
    include: { sample: { include: { result: true } } },
  });
  if (!evidence) return res.status(404).send("Not found");

  const session = await getSession(req);
  const published = Boolean(evidence.sample.result);
  const privileged =
    session &&
    (session.role === "ADMIN" ||
      session.role === "LAB" ||
      (session.role === "COLLECTOR" &&
        evidence.sample.collectorId === session.id));

  if (!published && !privileged) {
    return res.status(403).send("Evidence available after lab publish");
  }

  try {
    const buf = await readFile(evidence.storagePath);
    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Evidence-SHA256", evidence.sha256);
    return res.send(buf);
  } catch {
    return res.status(404).send("File missing");
  }
});
