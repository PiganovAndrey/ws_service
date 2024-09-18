import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { WsLoggingInterceptor } from 'src/common/interceptors/LogginInterceptor';
import configuration from 'src/config/configuration';
import { winstonConfig } from 'src/config/winston.config';
import { SessionGuard } from 'src/guards/session.guard';
import { ChatModule } from '../chat/chat.module';
import { ClientsModule, Transport } from '@nestjs/microservices';


const configService = new ConfigService();
const KAFKA_BROKERS = configService.get<string>('KAFKA_BROKERS');
const CLIENT_ID = configService.get<string>('KAFKA_CLIENT_ID');
const GROUP_ID = configService.get<string>('KAFKA_GROUP_ID');
@Module({
    imports: [
        ChatModule,
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration]
        }),
        WinstonModule.forRoot({
            transports: winstonConfig.transports,
            format: winstonConfig.format,
            level: winstonConfig.level
        }),
        ClientsModule.register([
            {
                name: 'CHAT_SERVICE',
                transport: Transport.KAFKA,
                options: {
                    client: {
                        clientId: CLIENT_ID,
                        brokers: [KAFKA_BROKERS]
                    },
                    consumer: {
                        groupId: GROUP_ID
                    }
                }
            },
            {
                name: 'AUTH_SERVICE',
                transport: Transport.KAFKA,
                options: {
                    client: {
                        clientId: 'auth-service',
                        brokers: [KAFKA_BROKERS]
                    },
                    consumer: {
                        groupId: 'auth-consumer-5',
                        retry: {
                            retries: 5,
                            restartOnFailure: async () => {
                                console.error('Consumer crashed, restarting...');
                                return true;
                              },
                        }
                    }
                }
            }
        ]),
    ],
    providers: [
        Reflector,
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_INTERCEPTOR, useClass: WsLoggingInterceptor },
    ],
})


export class AppModule {}
