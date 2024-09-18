import { PickType } from '@nestjs/mapped-types';
import { CreateMessageDto } from './create-message.dto';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class PinMessageDto extends PickType(CreateMessageDto, ['match_uid', 'to_uid']) {
    @IsNotEmpty()
    @IsBoolean()
    value: boolean;
    @IsString()
    @IsNotEmpty()
    message_uid: string;
}
