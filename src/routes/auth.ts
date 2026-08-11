import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  getSession,
  signToken,
  type SessionUser,
} from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { fail, ok } from "../lib/http";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await authenticate(body.email, body.password);
    if (!user) return fail(res, new Error("Invalid email or password"));
    const token = await signToken(user);
    await writeAudit({
      actorUserId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
    });
    return ok(res, { user, token });
  } catch (e) {
    return fail(res, e);
  }
});

authRouter.post("/logout", async (req, res) => {
  const user = await getSession(req);
  if (user) {
    try {
      await writeAudit({
        actorUserId: user.id,
        action: "LOGOUT",
        entityType: "User",
        entityId: user.id,
      });
    } catch {
      // ignore stale users
    }
  }
  return ok(res, { ok: true });
});

authRouter.get("/me", async (req, res) => {
  const user: SessionUser | null = await getSession(req);
  return ok(res, { user });
});
