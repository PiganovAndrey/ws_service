import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    OnGatewayDisconnect,
    OnGatewayConnection,
    OnGatewayInit,
    ConnectedSocket
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server } from 'http';
import { Inject, LoggerService, UseGuards, UseInterceptors } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Socket } from 'socket.io';
import { PinMessageDto } from './dto/pin-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { ClientKafka } from '@nestjs/microservices';
import { SessionGuard } from 'src/guards/session.guard';
import { WsLoggingInterceptor } from 'src/common/interceptors/LogginInterceptor';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/roles.enums';
import { CreateDialogDto } from './dto/create-dialog.dto';

@WebSocketGateway({ transports: ['websocket', 'polling'], path: '/chat' })
@UseGuards(SessionGuard)
@UseInterceptors(WsLoggingInterceptor)
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly chatService: ChatService,
        @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
        @Inject('CHAT_SERVICE') private readonly client: ClientKafka,
        @Inject('ANALYTICS_SERVICE') private readonly clientAnalytics: ClientKafka
    ) {}

    async afterInit(_: Server) {
        this.logger.log('WebSocket server initialized');

        this.client.subscribeToResponseOf('message.send');
        this.client.subscribeToResponseOf('message.update.all');
        this.client.subscribeToResponseOf('message.update.admin');
        this.client.subscribeToResponseOf('message.read');
        this.client.subscribeToResponseOf('message.reply');
        this.client.subscribeToResponseOf('message.pin');
        this.client.subscribeToResponseOf('message.delete');
        this.client.subscribeToResponseOf('dialog.create');
        this.client.subscribeToResponseOf('dialog.delete');
        this.clientAnalytics.subscribeToResponseOf('online.set');

        await this.client.connect();
        await this.clientAnalytics.connect();
    }

    async handleConnection(client: Socket) {
        await this.chatService.connect(client);
        this.logger.log(`Client connected: ${client.id}`);
    }

    async handleDisconnect(client: Socket) {
        const user = client.user;
        if (user.role === 'ROLE_ADMIN') {
            return;
        }
        await this.chatService.leave(client);
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('chat-pin-message')
    @Roles(Role.ALL)
    async setPinMessage(@ConnectedSocket() client: Socket, @MessageBody() data: PinMessageDto) {
        try {
            await this.chatService.setPinWsMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to set pin message', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('typing-start')
    @Roles(Role.ALL)
    typingStart(client: Socket, to_uid: string) {
        client.to(to_uid).emit('typing', true);
    }

    @SubscribeMessage('typing-stop')
    @Roles(Role.ALL)
    typingStop(client: Socket, to_uid: string) {
        client.to(to_uid).emit('typing', false);
    }

    @SubscribeMessage('chat-reply-message')
    @Roles(Role.ALL)
    async sendReplyToMessage(@ConnectedSocket() client: Socket, @MessageBody() data: ReplyMessageDto) {
        try {
            await this.chatService.sendReplyToMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to send reply message:', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('chat-message')
    @Roles(Role.ALL)
    async sendWsMessage(@ConnectedSocket() client: Socket, @MessageBody() data: CreateMessageDto) {
        try {
            await this.chatService.sendWsMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to send message', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('chat-update-message')
    @Roles(Role.ALL)
    async updateWsMessage(@ConnectedSocket() client: Socket, @MessageBody() data: UpdateMessageDto) {
        try {
            await this.chatService.updateWsMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to update mesage', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('chat-delete-message')
    @Roles(Role.ALL)
    async deleteWsMessage(@ConnectedSocket() client: Socket, @MessageBody() data: DeleteMessageDto) {
        try {
            await this.chatService.deleteWsMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to delete message', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('chat-read-message')
    @Roles(Role.ALL)
    async readWsMessage(@ConnectedSocket() client: Socket, @MessageBody() data: ReadMessageDto) {
        try {
            await this.chatService.readWsMessage(client, data);
        } catch (error) {
            this.logger.error('Failed to send read-message', error);
            client.emit('error', error);
        }
    }

    @SubscribeMessage('chat-dialog-create')
    @Roles(Role.ALL)
    async createWsDialog(@ConnectedSocket() client: Socket, @MessageBody() data: CreateDialogDto) {
        try {
            await this.chatService.createWsDialog(client, data);
        } catch (error) {
            this.logger.error('Failed to create dialog');
            client.emit('error');
        }
    }

    @SubscribeMessage('chat-dialog-delete')
    @Roles(Role.ALL)
    async deleteWsDialog(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { match_uid: string; to_uid: string }
    ) {
        try {
            await this.chatService.deleteWsDialog(client, data);
        } catch (e) {
            this.logger.error('Failed to delete dialog');
            client.emit('error');
        }
    }

    @SubscribeMessage('leftRoom')
    @Roles(Role.ALL)
    async leftRoom(@ConnectedSocket() client: Socket) {
        try {
            await this.chatService.leave(client);
        } catch (error) {
            this.logger.error('Failed leave in room');
            client.emit('error', error);
        }
    }

    @SubscribeMessage('error')
    @Roles(Role.ALL)
    async error(@ConnectedSocket() client: Socket) {
        await this.chatService.leave(client);
    }
}
