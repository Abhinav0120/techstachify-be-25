import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

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

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<SanitizedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (dto.newPassword != null && dto.newPassword !== '') {
      if (!dto.currentPassword?.trim()) {
        throw new BadRequestException('Current password is required to set a new password');
      }
      const passwordValid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!passwordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    if (dto.email != null && dto.email !== '' && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const data: { name?: string; email?: string; password?: string } = {};
    if (dto.name != null && dto.name !== '') {
      data.name = dto.name;
    }
    if (dto.email != null && dto.email !== '') {
      data.email = dto.email;
    }
    if (dto.newPassword != null && dto.newPassword !== '') {
      data.password = await bcrypt.hash(dto.newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return this.sanitizeUser(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.sanitizeUser(updated);
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
