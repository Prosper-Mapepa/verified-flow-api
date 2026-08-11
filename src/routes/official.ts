import { Router } from "express";
import { DEFAULT_PWSID, getOfficialContext } from "../lib/epaOfficial";
import { fail, ok } from "../lib/http";

export const officialRouter = Router();

officialRouter.get("/context", async (req, res) => {
  try {
    const pwsid =
      typeof req.query.pwsid === "string" && req.query.pwsid.trim()
        ? req.query.pwsid.trim()
        : DEFAULT_PWSID;
    const context = await getOfficialContext(pwsid);
    return ok(res, { context });
  } catch (e) {
    return fail(res, e);
  }
});
