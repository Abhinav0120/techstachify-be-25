import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SendMessageDto {
	@IsNotEmpty()
	@IsString()
	conversationId: string;

	@IsNotEmpty()
	@IsString()
	@Length(1, 4000)
	content: string;
}
