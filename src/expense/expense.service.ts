import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateExpenseDto) {
    await this.validateCategoryAccess(userId, dto.categoryId);

    return this.prisma.expense.create({
      data: {
        amount: dto.amount,
        description: dto.description,
        date: new Date(dto.date),
        categoryId: dto.categoryId,
        userId,
      },
      include: { category: true },
    });
  }

  async findAll(userId: number, query: QueryExpenseDto) {
    const where: Record<string, unknown> = { userId };

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) {
        (where.date as Record<string, unknown>).gte = new Date(query.startDate);
      }
      if (query.endDate) {
        (where.date as Record<string, unknown>).lte = new Date(query.endDate);
      }
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const orderBy: Record<string, string> = {};
    orderBy[query.sortBy ?? 'date'] = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: number, id: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    if (expense.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return expense;
  }

  async update(userId: number, id: number, dto: UpdateExpenseDto) {
    await this.findOne(userId, id);

    if (dto.categoryId) {
      await this.validateCategoryAccess(userId, dto.categoryId);
    }

    const data: Record<string, unknown> = {};
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;

    return this.prisma.expense.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async remove(userId: number, id: number) {
    await this.findOne(userId, id);

    return this.prisma.expense.delete({ where: { id } });
  }

  async getSummary(userId: number) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const [thisMonth, lastMonth, allTime] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { userId, date: { gte: thisMonthStart } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { userId, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
    ]);

    return {
      thisMonth: thisMonth._sum.amount ?? 0,
      lastMonth: lastMonth._sum.amount ?? 0,
      allTime: allTime._sum.amount ?? 0,
    };
  }

  async getByCategory(userId: number) {
    const results = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { userId },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const categoryIds = results.map((r) => r.categoryId);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return results.map((r) => ({
      categoryId: r.categoryId,
      categoryName: categoryMap.get(r.categoryId)?.name ?? 'Unknown',
      color: categoryMap.get(r.categoryId)?.color ?? '#6b7280',
      total: r._sum.amount ?? 0,
    }));
  }

  async getMonthlyTrend(userId: number, months = 6) {
    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - months + 1,
      1,
    );

    const expenses = await this.prisma.expense.findMany({
      where: { userId, date: { gte: startDate } },
      select: { amount: true, date: true },
    });

    const monthlyMap = new Map<string, number>();

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, 0);
    }

    for (const expense of expenses) {
      const d = new Date(expense.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + expense.amount);
    }

    return Array.from(monthlyMap.entries()).map(([month, total]) => ({
      month,
      total,
    }));
  }

  async getCategories(userId: number) {
    return this.prisma.category.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(userId: number, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { name: dto.name, userId },
    });

    if (existing) {
      throw new BadRequestException('Category with this name already exists');
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        color: dto.color ?? '#6b7280',
        userId,
      },
    });
  }

  async deleteCategory(userId: number, id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category.userId !== userId) {
      throw new ForbiddenException(
        "Cannot delete system or other users' categories",
      );
    }

    const expenseCount = await this.prisma.expense.count({
      where: { categoryId: id },
    });

    if (expenseCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${expenseCount} expense(s). Reassign them first.`,
      );
    }

    return this.prisma.category.delete({ where: { id } });
  }

  private async validateCategoryAccess(userId: number, categoryId: number) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (category.userId !== null && category.userId !== userId) {
      throw new ForbiddenException('Access to this category denied');
    }
  }
}
