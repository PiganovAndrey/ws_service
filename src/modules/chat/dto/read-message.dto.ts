import { PickType } from '@nestjs/mapped-types';
import { CreateMessageDto } from './create-message.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReadMessageDto extends PickType(CreateMessageDto, ['match_uid']) {
    @IsString()
    @IsNotEmpty()
    from_uid: string;
    @IsString()
    @IsNotEmpty()
    to: string;
    @IsString()
    @IsNotEmpty()
    message_uid: string;
}
