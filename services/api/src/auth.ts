import type { RequestHandler } from "express";
import { ApiErrorCodes } from "@frankenstein/shared-types";
import { HttpError } from "./errors.js";

export function createAuthMiddleware(apiToken: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.header("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      next(new HttpError(401, ApiErrorCodes.UNAUTHORIZED, "Missing or invalid Authorization header"));
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token || token !== apiToken) {
      next(new HttpError(401, ApiErrorCodes.UNAUTHORIZED, "Invalid API token"));
      return;
    }
    next();
  };
}
