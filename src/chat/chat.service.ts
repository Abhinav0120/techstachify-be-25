import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { OpenAI } from 'openai';

@Injectable()
export class ChatService {
	private openai: OpenAI;

	constructor(private readonly prisma: PrismaService) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error(
				'OPENAI_API_KEY environment variable is not set. Please configure it before starting the service.',
			);
		}
		this.openai = new OpenAI({
			apiKey,
		});
	}

	async createConversation(userId: number) {
		return this.prisma.conversation.create({
			data: {
				userId,
			},
		});
	}

	async sendMessage(
		userId: number,
		conversationId: string,
		dto: SendMessageDto,
	) {
		// Verify user owns conversation
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
		});

		if (!conversation) {
			throw new BadRequestException('Conversation not found');
		}

		if (conversation.userId !== userId) {
			throw new ForbiddenException('Access denied to this conversation');
		}

		// Save user message immediately
		const userMessage = await this.prisma.message.create({
			data: {
				conversationId,
				userId,
				role: 'USER',
				content: dto.content,
				completionStatus: 'COMPLETE',
			},
		});

		return {
			messageId: userMessage.id,
			conversationId,
			userMessage,
		};
	}

	async streamOpenAIResponse(
		userId: number,
		conversationId: string,
		userContent: string,
	) {
		// Verify conversation and user access
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
		});

		if (!conversation || conversation.userId !== userId) {
			throw new ForbiddenException('Access denied');
		}

		// Get recent messages for context
		const recentMessages = await this.prisma.message.findMany({
			where: { conversationId },
			orderBy: { createdAt: 'asc' },
			take: 10,
		});

		// Build message history for OpenAI with type safety
		const messages: Array<{ role: 'user' | 'assistant'; content: string }> = recentMessages.map((msg) => {
			// Validate role is one of allowed values
			if (msg.role !== 'USER' && msg.role !== 'ASSISTANT') {
				throw new BadRequestException(`Invalid message role: ${msg.role}`);
			}
			return {
				role: msg.role === 'USER' ? 'user' : 'assistant',
				content: msg.content,
			};
		});

		messages.push({
			role: 'user',
			content: userContent,
		});

		// Stream with retry logic (using OpenAI GPT model)
		const streamFn = async () => {
			return await (this.openai as any).chat.completions.create({
				model: 'gpt-4o-mini',
				max_tokens: 2000,
				messages,
				temperature: 0.7,
			});
		};

		try {
			const response = await this.retryWithBackoff(streamFn);
			const content = response.choices[0]?.message?.content || '';
			return {
				id: response.id,
				content,
			};
		} catch (error) {
			throw new ServiceUnavailableException(
				'Failed to get response from OpenAI after retries',
			);
		}
	}

	async saveAIMessage(
		userId: number,
		conversationId: string,
		content: string,
		completionStatus: 'COMPLETE' | 'TRUNCATED' = 'COMPLETE',
	) {
		// Verify conversation
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
		});

		if (!conversation || conversation.userId !== userId) {
			throw new ForbiddenException('Access denied');
		}

		return this.prisma.message.create({
			data: {
				conversationId,
				userId,
				role: 'ASSISTANT',
				content,
				completionStatus,
			},
		});
	}

	async getConversations(
		userId: number,
		query: GetConversationsDto,
	) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const skip = (page - 1) * limit;

		const [conversations, total] = await Promise.all([
			this.prisma.conversation.findMany({
				where: { userId },
				include: {
					messages: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: {
							id: true,
							content: true,
							createdAt: true,
						},
					},
				},
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit,
			}),
			this.prisma.conversation.count({ where: { userId } }),
		]);

		return {
			data: conversations.map((conv) => ({
				...conv,
				latestMessage: conv.messages[0] || null,
				messages: undefined,
			})),
			total,
			page,
			totalPages: Math.ceil(total / limit),
		};
	}

	async getMessages(
		userId: number,
		conversationId: string,
		query: GetMessagesDto,
	) {
		// Verify user owns conversation
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
		});

		if (!conversation || conversation.userId !== userId) {
			throw new ForbiddenException('Access denied');
		}

		const where: Record<string, unknown> = {
			conversationId,
		};

		if (query.cursor) {
			where.createdAt = { lt: new Date(query.cursor) };
		}

		const limit = query.limit ?? 20;

		const messages = await this.prisma.message.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			take: limit + 1, // Get one extra to determine if there are more
		});

		const hasMore = messages.length > limit;
		const displayMessages = messages.slice(0, limit);

		return {
			data: displayMessages,
			hasMore,
			nextCursor: displayMessages.length > 0
				? displayMessages[displayMessages.length - 1].createdAt.toISOString()
				: null,
		};
	}

	async retryWithBackoff<T>(
		fn: () => Promise<T>,
		maxRetries: number = 5,
	): Promise<T> {
		const delays = [500, 1000, 2000, 4000, 8000]; // in milliseconds

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error: unknown) {
				const isLastAttempt = attempt === maxRetries - 1;

				// Determine if error is retryable
				let isRetryable = false;
				if (error instanceof Error) {
					const errorObj = error as any;
					const status = errorObj.status;

					// Retryable: 5xx errors (but not 429 rate limit, needs special handling)
					isRetryable =
						(status >= 500 && status < 600) ||
						error.message.includes('ECONNREFUSED') ||
						error.message.includes('ETIMEDOUT') ||
						error.message.includes('timeout');

					// Non-retryable: 4xx errors (client errors, auth failures, etc)
					if (status >= 400 && status < 500) {
						isRetryable = false;
					}

					// Rate limit (429) needs special handling - wait longer
					if (status === 429 && !isLastAttempt) {
						const delay = Math.min(30000, (2 ** attempt) * 1000); // Exponential, capped at 30s
						await new Promise(resolve => setTimeout(resolve, delay));
						continue;
					}
				}

				if (isLastAttempt || !isRetryable) {
					throw error;
				}

				const delay = delays[attempt] ?? 8000;
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}

		throw new Error('Retry logic failed');
	}
}
