import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
    @IsString()
    @IsNotEmpty()
    readonly match_uid: string;
    @IsString()
    @IsNotEmpty()
    readonly to_uid: string;
    @IsString()
    @IsNotEmpty()
    readonly content: string;
    @IsBoolean()
    @IsOptional()
    readonly is_user1_favorite?: boolean;
    @IsBoolean()
    @IsOptional()
    readonly is_user2_favorite?: boolean;
    @IsNotEmpty()
    @IsDateString()
    @Transform(({ value }) => new Date(value).toISOString(), { toClassOnly: true })
    readonly sent_time: string;
}
