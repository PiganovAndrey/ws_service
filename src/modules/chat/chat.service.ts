import { HttpException, HttpStatus, Inject, Injectable, LoggerService } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { Socket } from 'socket.io';
// import axios from 'axios';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { PinMessageDto } from './dto/pin-message.dto';
import { WsException } from '@nestjs/websockets';
import { ClientKafka } from '@nestjs/microservices';
import ITokenData from 'src/common/interfaces/token.data';
import { CreateDialogDto } from './dto/create-dialog.dto';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class ChatService {
    constructor(
        @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
        @Inject('CHAT_SERVICE') private readonly client: ClientKafka,
        @Inject('AUTH_SERVICE') private readonly clientAuth: ClientKafka,
        @Inject('ANALYTICS_SERVICE') private readonly clientAnalytics: ClientKafka
    ) {}

    async leave(client: Socket): Promise<void> {
        try {
            this.logger.log('Client leave method called', { clientId: client.id });
            const uid = client.user?.userUid;
            const online = await lastValueFrom(
                this.clientAnalytics.send('online.set', { online: false, userUid: uid })
            );
            client.broadcast.emit('user-online', online);
            client.leave(uid);
        } catch (e) {
            this.logger.error('Error in leave method', e);
            throw e;
        }
    }

    async connect(client: Socket): Promise<void> {
        try {
            this.logger.log('Client connect method called', { clientId: client.id });
            const { accessToken, refreshToken } = client.handshake.auth.accessToken
                ? client.handshake.auth
                : {
                      accessToken: { value: client.handshake.headers.authorization.split(' ')[1] },
                      refreshToken: { value: client.handshake.headers.authorization.split(' ')[2] }
                  };
            if (!accessToken.value && !refreshToken.value) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }
            const userData: ITokenData = await lastValueFrom(
                this.clientAuth.send<ITokenData>('auth.session', {
                    authorization: {
                        accessToken:
                            accessToken.value.startsWith('"') && accessToken.value.endsWith('"')
                                ? accessToken.value.slice(1, -1)
                                : accessToken.value,
                        refreshToken:
                            refreshToken.value.startsWith('"') && refreshToken.value.endsWith('"')
                                ? refreshToken.value.slice(1, -1)
                                : refreshToken.value
                    }
                })
            );

            client.user = { ...userData };
            const user = client.user;
            if (user.role === 'ROLE_ADMIN') {
                client.join('support');
            } else {
                client.join(user.userUid);
                const online = await lastValueFrom(
                    this.clientAnalytics.send('online.set', { online: true, userUid: client.user.userUid })
                );
                client.broadcast.emit('user-online', online);
            }
        } catch (e) {
            this.logger.error('Error in connect method', e);
            throw e;
        }
    }

    async updateWsMessage(client: Socket, dto: UpdateMessageDto): Promise<void> {
        try {
            this.logger.log('Client updateWsMessage method called', { clientId: client.id, dto });
            const uid = client.user.userUid;
            const observable = this.client.send(
                'message.update.all',
                JSON.stringify({ message_uid: dto.message_uid, content: dto.content })
            );
            observable.subscribe({
                next: () => {
                    this.logger.log('Complete response from Kafka');
                },
                error: (err) => {
                    this.logger.error('Error from Kafka:', err);
                    throw new WsException('Error processing message');
                },
                complete: () => {
                    this.logger.log('Message processing complete');
                }
            });
            client.to(dto.to_uid).emit('server:message-sent-update', {
                message_uid: dto.message_uid,
                from_uid: uid,
                content: dto.content
            });
            client.emit('server:message-sent-update', {
                message_uid: dto.message_uid,
                from_uid: uid,
                content: dto.content
            });
        } catch (e) {
            this.logger.error('Error in updateWsMessage method', e);
            throw e;
        }
    }

    async deleteWsMessage(client: Socket, dto: DeleteMessageDto): Promise<void> {
        try {
            this.logger.log('Client deleteWsMessage method called', { clientId: client.id, dto });
            const uid = client.user.userUid;
            const observable = this.client.send('message.delete', JSON.stringify(dto.message_uids));
            observable.subscribe({
                next: () => {
                    this.logger.log('Complete response from Kafka');
                },
                error: (err) => {
                    this.logger.error('Error from Kafka:', err);
                    throw new WsException('Error processing message');
                },
                complete: () => {
                    this.logger.log('Message processing complete');
                }
            });
            client.to(dto.to_uid).emit('server:messege-delete', { message_uids: dto.message_uids, from_uid: uid });
            client.emit('server:messege-delete', { message_uids: dto.message_uids, from_uid: uid });
        } catch (e) {
            this.logger.error('Error in deleteWsMessage method', e);
            throw e;
        }
    }

    async sendWsMessage(client: Socket, dto: CreateMessageDto): Promise<void> {
        try {
            this.logger.log('Client sendWsMessage method called', { clientId: client.id, dto });
            const uid = client.user?.userUid;
            const messageData = {
                match_uid: dto.match_uid,
                from_uid: uid,
                to_uid: dto.to_uid,
                content: dto.content,
                is_user1_favorite: dto.is_user1_favorite,
                is_user2_favorite: dto.is_user2_favorite,
                sent_time: dto.sent_time
            };
            const message = await lastValueFrom(this.client.send('message.send', JSON.stringify(messageData)));
            if (!message) {
                this.logger.error('Error from Kafka');
                throw new WsException('Error processing message');
            }
            this.logger.log('Complete response from Kafka');
            client.to(dto.to_uid).emit('server:message-sent', { ...messageData, message_uid: message.newMessage });
            client.emit('server:message-sent', { ...messageData, message_uid: message.newMessage });
        } catch (e) {
            this.logger.error('Error in sendWsMessage method', e);
            throw e;
        }
    }

    async sendReplyToMessage(client: Socket, dto: ReplyMessageDto): Promise<void> {
        try {
            this.logger.log('Client sendReplyToMessage method called', { clientId: client.id, dto });
            const uid = client.user?.userUid;
            const replyMessageData = {
                reply_message_uid: dto.reply_message_uid,
                from_uid: uid,
                match_uid: dto.match_uid,
                is_user1_favorite: dto.is_user1_favorite,
                is_user2_favorite: dto.is_user2_favorite,
                to_uid: dto.to_uid,
                sent_time: dto.sent_time,
                content: dto.content
            };
            const replyMessage = await lastValueFrom(
                this.client.send('message.reply', JSON.stringify(replyMessageData))
            );
            if (!replyMessage) {
                this.logger.error('Error from Kafka');
                throw new WsException('Error processing message');
            }
            this.logger.log('Complete response from Kafka');
            client.to(dto.to_uid).emit('server:message-reply-sent', {
                ...replyMessageData,
                message_uid: replyMessage.message_uid,
                replyToMessage: replyMessage.replyToMessage
            });
            client.emit('server:message-reply-sent', {
                ...replyMessageData,
                message_uid: replyMessage.message_uid,
                replyToMessage: replyMessage.replyToMessage
            });
        } catch (e) {
            this.logger.error('Error in sendReplyToMessage method', e);
            throw e;
        }
    }

    async readWsMessage(client: Socket, dto: ReadMessageDto): Promise<void> {
        try {
            this.logger.log('Client readWsMessage method called', { clientId: client.id, dto });
            const readMessage = {
                message_uid: dto.message_uid,
                match_uid: dto.match_uid
            };
            const observable = this.client.send('message.read', JSON.stringify(readMessage));
            observable.subscribe({
                next: () => {
                    this.logger.log('Complete response from Kafka');
                },
                error: (err) => {
                    this.logger.error('Error from Kafka:', err);
                    throw new WsException('Error processing message');
                },
                complete: () => {
                    this.logger.log('Message processing complete');
                }
            });
            client.to(dto.to).emit('server:message-read-sent', readMessage);
            client.emit('server:message-read-sent', readMessage);
        } catch (e) {
            this.logger.error('Error in readWsMessage method', e);
            throw e;
        }
    }

    async setPinWsMessage(client: Socket, dto: PinMessageDto): Promise<void> {
        try {
            this.logger.log('Client setPinWsMessage method called', { clientId: client.id, dto });
            const uid = client.user.userUid;
            const pinMessageData = {
                match_uid: dto.match_uid,
                value: dto.value,
                to_uid: dto.to_uid,
                from_uid: uid
            };
            const pinMessage = await lastValueFrom(this.client.send('message.pin', JSON.stringify(pinMessageData)));
            if (!pinMessage) {
                this.logger.error('Error from Kafka:');
                throw new WsException('Error processing message');
            }
            client.to(dto.to_uid).emit('server:message-pinned', { ...pinMessageData });
            client.emit('server:message-pinned', { ...pinMessageData });
        } catch (e) {
            this.logger.error('Error in setPinWsMessage method', e);
            throw e;
        }
    }

    async createWsDialog(client: Socket, dto: CreateDialogDto) {
        try {
            this.logger.log('Client createWsDialog method called', { clientId: client.id, dto });
            const dialogData = {
                match_uid: dto.match_uid,
                user1: dto.user1,
                user2: dto.user2
            };
            const dialog = await lastValueFrom(this.client.send('dialog.create', JSON.stringify(dialogData)));
            if (!dialog) {
                this.logger.error('Error from Kafka:');
                throw new WsException('Error processing message');
            }
            client.to(dto.to_uid).emit('server:dialog-create', { ...dialogData });
            client.emit('server:dialog-create', { ...dialogData });
        } catch (e) {
            this.logger.error('Error create dialog method', e);
            throw e;
        }
    }
    async deleteWsDialog(client: Socket, dto: { match_uid: string; to_uid: string }) {
        try {
            this.logger.log('Client deleteWsDialog method called', { clientId: client.id, dto });
            const dialogDelete = await lastValueFrom(
                this.client.send('dialog.delete', JSON.stringify({ match_uid: dto.match_uid }))
            );
            if (!dialogDelete) {
                this.logger.error('Error from Kafka:');
                throw new WsException('Error processing message');
            }
            client.to(dto.to_uid).emit('server:dialog-delete', { ...dialogDelete });
            client.emit('server:dialog-delete', { ...dialogDelete });
        } catch (e) {
            this.logger.error('Error delete dialog method', e);
            throw e;
        }
    }
}
