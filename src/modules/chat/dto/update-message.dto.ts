import { PickType } from '@nestjs/mapped-types';
import { CreateMessageDto } from './create-message.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMessageDto extends PickType(CreateMessageDto, ['content', 'to_uid']) {
    @IsNotEmpty()
    @IsString()
    message_uid: string;
}
