import { IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesDto {
	@IsOptional()
	cursor?: string;

	@IsOptional()
	@Type(() => Number)
	@IsPositive()
	limit: number = 20;
}
