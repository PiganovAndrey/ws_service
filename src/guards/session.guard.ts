import {
    Injectable,
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    ForbiddenException,
    Inject
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import ITokenData from './../common/interfaces/token.data';
import { Socket } from 'socket.io';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject('AUTH_SERVICE') private readonly clientKafka: ClientKafka
    ) {}

    async onModuleInit() {
        this.clientKafka.subscribeToResponseOf('auth.session'); // Подписка на топик для ответа
        await this.clientKafka.connect(); // Подключение клиента
      }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const wsContext = context.switchToWs();
        const client: Socket = wsContext.getClient<Socket>();
        const { accessToken, refreshToken } = client.handshake.auth.accessToken
            ? client.handshake.auth
            : {
                  accessToken: { value: client.handshake.headers.authorization.split(' ')[1] },
                  refreshToken: { value: client.handshake.headers.authorization.split(' ')[2] }
              };
        if (!accessToken.value && !refreshToken.value) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }

        try {
            const user = await lastValueFrom(
                this.clientKafka.send<ITokenData>('auth.session', { authorization: {accessToken:                         accessToken.value.startsWith('"') && accessToken.value.endsWith('"')
                    ? accessToken.value.slice(1, -1)
                    : accessToken.value, 
                    refreshToken:                         refreshToken.value.startsWith('"') && refreshToken.value.endsWith('"')
                    ? refreshToken.value.slice(1, -1)
                    : refreshToken.value} }),
              );
        
              if (!user) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
              }
            


            if (!user.userUid) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

            if (
                requiredRoles &&
                !this.hasRequiredRole(user.role, requiredRoles) &&
                !requiredRoles.includes('all')
            ) {
                throw new ForbiddenException('You do not have the required role to access this resource');
            }

            return true;
        } catch (error) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
    }

    private hasRequiredRole(userRole: string, requiredRoles: string[]): boolean {
        return requiredRoles.includes(userRole);
    }
}
