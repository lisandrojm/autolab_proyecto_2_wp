import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[error]", err);
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = typeof err?.message === "string" ? err.message : "Internal error";
  res.status(status).json({ error: message });
};
