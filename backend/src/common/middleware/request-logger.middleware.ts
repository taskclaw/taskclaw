import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { ip, method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const correlationId = (req as any).correlationId || '-';

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');

      this.logger.log(
        `[${correlationId}] ${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`,
      );
    });

    next();
  }
}
