import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

interface AuthenticatedSocket extends Socket {
	userId?: number;
}

@WebSocketGateway({
	namespace: '/chat',
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:5173',
		credentials: true,
	},
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer() server: Server;
	private logger = new Logger('ChatGateway');

	constructor(
		private chatService: ChatService,
		private jwtService: JwtService,
	) {}

	async handleConnection(client: AuthenticatedSocket) {
		try {
			const token = client.handshake.auth.token as string | undefined;

			if (!token) {
				this.logger.warn('WebSocket connection attempt without auth token');
				client.disconnect();
				return;
			}

			const decoded = await this.jwtService.verifyAsync(token);

			// Validate token payload structure
			if (!decoded || typeof decoded.sub !== 'number') {
				this.logger.error('Invalid token payload structure', { token: token.substring(0, 20) + '...' });
				client.disconnect();
				return;
			}

			client.userId = decoded.sub;

			// Join user-specific room
			client.join(`user-${client.userId}`);

			this.logger.log(`Client ${client.id} connected with userId ${client.userId}`);
		} catch (error) {
			this.logger.error('Authentication failed', error);
			client.disconnect();
		}
	}

	handleDisconnect(client: AuthenticatedSocket) {
		this.logger.log(
			`Client ${client.id} disconnected (userId: ${client.userId})`,
		);
	}

	@SubscribeMessage('typing:start')
	async handleTypingStart(
		client: AuthenticatedSocket,
		data: { conversationId: string },
	) {
		if (!client.userId) return;

		this.server
			.to(`conversation-${data.conversationId}`)
			.emit('typing:start', {
				userId: client.userId,
				conversationId: data.conversationId,
			});
	}

	@SubscribeMessage('typing:stop')
	async handleTypingStop(
		client: AuthenticatedSocket,
		data: { conversationId: string },
	) {
		if (!client.userId) return;

		this.server
			.to(`conversation-${data.conversationId}`)
			.emit('typing:stop', {
				userId: client.userId,
				conversationId: data.conversationId,
			});
	}

	async emitMessageChunk(
		conversationId: string,
		chunk: string,
	) {
		this.server
			.to(`conversation-${conversationId}`)
			.emit('ai:chunk', { chunk });
	}

	async emitMessageReady(
		conversationId: string,
		messageId: string,
	) {
		this.server
			.to(`conversation-${conversationId}`)
			.emit('ai:ready', { messageId });
	}

	async emitError(
		conversationId: string,
		code: string,
		message: string,
	) {
		this.server
			.to(`conversation-${conversationId}`)
			.emit('ai:error', { code, message });
	}

	joinConversationRoom(clientId: string, conversationId: string) {
		const clients = this.server.sockets.sockets.get(clientId);
		if (clients) {
			(clients as AuthenticatedSocket).join(`conversation-${conversationId}`);
		}
	}

	leaveConversationRoom(clientId: string, conversationId: string) {
		const clients = this.server.sockets.sockets.get(clientId);
		if (clients) {
			(clients as AuthenticatedSocket).leave(`conversation-${conversationId}`);
		}
	}
}
