import { PickType } from '@nestjs/mapped-types';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { CreateMessageDto } from './create-message.dto';

export class DeleteMessageDto extends PickType(CreateMessageDto, ['match_uid', 'to_uid']) {
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    message_uids: string[];
}
