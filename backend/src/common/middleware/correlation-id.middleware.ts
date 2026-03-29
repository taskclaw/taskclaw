import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private logger = new Logger('CorrelationId');

  use(req: Request, res: Response, next: NextFunction) {
    // Use existing correlation ID from header, or generate a new one
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) ||
      randomUUID();

    // Attach to request for downstream use
    (req as any).correlationId = correlationId;

    // Add to response headers so clients can reference it
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
