import type { Response } from "express";
import { ApiErrorCodes, type ApiErrorCode } from "@frankenstein/shared-types";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  // Avoid leaking internals
  console.error(`[ERROR] [Api] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  res.status(500).json({
    error: {
      code: ApiErrorCodes.INTERNAL,
      message: "Internal server error",
    },
  });
  void message;
}
