import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app/app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import 'socket.io';
import ITokenData from './common/interfaces/token.data';

declare module 'socket.io' {
    interface Socket {
        user?: ITokenData;
    }
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    const PORT = configService.get<string>('port') || 5012;
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
    await app.listen(PORT);
}
bootstrap();
