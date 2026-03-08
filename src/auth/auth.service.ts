import * as bcrypt from 'bcrypt';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** User shape returned by API (no password). */
export interface SanitizedUser {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: SanitizedUser; accessToken: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        name: dto.name,
      },
    });
    const accessToken = this.jwtService.sign({ sub: user.id });
    return { user: this.sanitizeUser(user), accessToken };
  }

  async login(dto: LoginDto): Promise<{ user: SanitizedUser; accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = this.jwtService.sign({ sub: user.id });
    return { user: this.sanitizeUser(user), accessToken };
  }

  async validateUser(userId: number): Promise<SanitizedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? this.sanitizeUser(user) : null;
  }

  private sanitizeUser(user: {
    id: number;
    email: string;
    name: string;
    role: string;
    createdAt: Date;
    password?: string;
  }): SanitizedUser {
    const { password: _password, ...rest } = user;
    return rest as SanitizedUser;
  }
}
