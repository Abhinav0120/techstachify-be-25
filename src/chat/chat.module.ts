import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Module({
	imports: [
		AuthModule,
		JwtModule.register({
			secret: process.env.JWT_SECRET || 'secret',
			signOptions: { expiresIn: '24h' },
		}),
	],
	controllers: [ChatController],
	providers: [ChatService, ChatGateway],
	exports: [ChatService],
})
export class ChatModule {}
