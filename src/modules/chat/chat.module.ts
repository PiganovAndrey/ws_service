import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();
const KAFKA_BROKERS = configService.get<string>('KAFKA_BROKERS');
const CLIENT_ID = configService.get<string>('KAFKA_CLIENT_ID');
const GROUP_ID = configService.get<string>('KAFKA_GROUP_ID');

@Module({
    providers: [ChatGateway, ChatService],
    exports: [ChatService],
    imports: [
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
                            }
                        }
                    }
                }
            },
            {
                name: 'ANALYTICS_SERVICE',
                transport: Transport.KAFKA,
                options: {
                    client: {
                        clientId: 'analytics-service',
                        brokers: [KAFKA_BROKERS]
                    },
                    consumer: {
                        groupId: 'analytics-consumer-1'
                    }
                }
            }
        ])
    ]
})
export class ChatModule {}
