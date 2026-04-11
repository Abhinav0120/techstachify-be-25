import { IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class GetConversationsDto {
	@IsOptional()
	@Type(() => Number)
	@IsPositive()
	page: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsPositive()
	limit: number = 20;
}
