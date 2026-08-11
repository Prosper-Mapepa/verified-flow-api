import type { Response } from "express";
import { ZodError } from "zod";
import { AuthError } from "./auth";

export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data);
}

export function fail(res: Response, error: unknown) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.flatten(),
    });
  }
  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: "Unexpected error" });
}
