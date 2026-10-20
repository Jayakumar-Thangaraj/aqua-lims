import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { FieldError } from '@aqualims/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class ValidationFailed extends HttpError {
  constructor(public fieldErrors: FieldError[], message = 'Please correct the highlighted fields.') {
    super(422, message, 'VALIDATION', fieldErrors);
  }
}

export const notFound = (what = 'Record') => new HttpError(404, `${what} was not found.`, 'NOT_FOUND');
export const forbidden = (message = 'You do not have permission to do this.') => new HttpError(403, message, 'FORBIDDEN');

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
