import { Injectable, NestInterceptor, ExecutionContext, CallHandler, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class WsLoggingInterceptor implements NestInterceptor {
    constructor(@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const wsContext = context.switchToWs();
        const data = wsContext.getData();
        const now = Date.now();

        this.logger.log(`Incoming WebSocket message: ${JSON.stringify(data)} - ${Date.now() - now}ms`);

        return next.handle().pipe(
            tap(() => {
                this.logger.log(`WebSocket response time: ${Date.now() - now}ms`);
            })
        );
    }
}
