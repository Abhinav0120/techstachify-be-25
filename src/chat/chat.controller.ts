import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Query,
	UseGuards,
	Request,
	HttpCode,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SanitizedUser } from '../auth/auth.service';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
	constructor(
		private readonly chatService: ChatService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Post('conversations')
	@HttpCode(201)
	createConversation(@Request() req: { user: SanitizedUser }) {
		return this.chatService.createConversation(req.user.id);
	}

	@Get('conversations')
	getConversations(
		@Request() req: { user: SanitizedUser },
		@Query() query: GetConversationsDto,
	) {
		return this.chatService.getConversations(req.user.id, query);
	}

	@Get('conversations/:conversationId/messages')
	async getMessages(
		@Request() req: { user: SanitizedUser },
		@Param('conversationId') conversationId: string,
		@Query() query: GetMessagesDto,
	) {
		// Verify access and get messages
		const messages = await this.chatService.getMessages(req.user.id, conversationId, query);

		// Note: WebSocket room join is handled on client-side via Socket.io
		// when user selects a conversation
		return messages;
	}

	@Post('conversations/:conversationId/send')
	@HttpCode(202)
	async sendMessage(
		@Request() req: { user: SanitizedUser },
		@Param('conversationId') conversationId: string,
		@Body() dto: SendMessageDto,
	) {
		const userId = req.user.id;

		// Save user message
		const userResult = await this.chatService.sendMessage(
			userId,
			conversationId,
			dto,
		);

		// Stream OpenAI response asynchronously (fire-and-track)
		const streamingPromise = this.streamOpenAIResponse(userId, conversationId, dto.content);

		// Don't await, but track promise to prevent premature GC
		streamingPromise.catch((error) => {
			this.chatGateway.emitError(
				conversationId,
				'STREAM_ERROR',
				error instanceof Error ? error.message : 'Failed to process OpenAI response',
			);
		});

		// Return 202 Accepted to indicate async processing
		return {
			...userResult,
			status: 'streaming',
		};
	}

	private async streamOpenAIResponse(
		userId: number,
		conversationId: string,
		userContent: string,
	): Promise<void> {
		try {
			const response = await this.chatService.streamOpenAIResponse(
				userId,
				conversationId,
				userContent,
			);

			// Batch emit to reduce socket traffic: emit every 20 characters
			const batchSize = 20;
			for (let i = 0; i < response.content.length; i += batchSize) {
				const chunk = response.content.substring(i, i + batchSize);
				this.chatGateway.emitMessageChunk(conversationId, chunk);
				// Small delay between batches
				await new Promise(resolve => setTimeout(resolve, 10));
			}

			// Save complete AI message
			const aiMessage = await this.chatService.saveAIMessage(
				userId,
				conversationId,
				response.content,
				'COMPLETE',
			);

			// Signal completion with actual message ID
			this.chatGateway.emitMessageReady(conversationId, aiMessage.id);
		} catch (error) {
			this.chatGateway.emitError(
				conversationId,
				'STREAM_ERROR',
				error instanceof Error ? error.message : 'Unknown error during streaming',
			);
			throw error;
		}
	}
}
