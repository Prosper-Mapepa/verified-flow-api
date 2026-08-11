import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { samplesRouter } from "./routes/samples";
import { resultsRouter } from "./routes/results";
import { alertsRouter } from "./routes/alerts";
import { evidenceRouter } from "./routes/evidence";
import { adminRouter } from "./routes/admin";

const app = express();
const port = Number(process.env.PORT || 4000);

const origins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "verified-flow-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/samples", samplesRouter);
app.use("/api/results", resultsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/evidence", evidenceRouter);
app.use("/api/admin", adminRouter);

app.listen(port, () => {
  console.log(`Verified Flow API listening on :${port}`);
  console.log(`CORS origins: ${origins.join(", ")}`);
});
