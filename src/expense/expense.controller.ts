import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SanitizedUser } from '../auth/auth.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  create(
    @Request() req: { user: SanitizedUser },
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenseService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req: { user: SanitizedUser },
    @Query() query: QueryExpenseDto,
  ) {
    return this.expenseService.findAll(req.user.id, query);
  }

  @Get('summary')
  getSummary(@Request() req: { user: SanitizedUser }) {
    return this.expenseService.getSummary(req.user.id);
  }

  @Get('by-category')
  getByCategory(@Request() req: { user: SanitizedUser }) {
    return this.expenseService.getByCategory(req.user.id);
  }

  @Get('monthly-trend')
  getMonthlyTrend(@Request() req: { user: SanitizedUser }) {
    return this.expenseService.getMonthlyTrend(req.user.id);
  }

  @Get('categories')
  getCategories(@Request() req: { user: SanitizedUser }) {
    return this.expenseService.getCategories(req.user.id);
  }

  @Post('categories')
  createCategory(
    @Request() req: { user: SanitizedUser },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.expenseService.createCategory(req.user.id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(
    @Request() req: { user: SanitizedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expenseService.deleteCategory(req.user.id, id);
  }

  @Get(':id')
  findOne(
    @Request() req: { user: SanitizedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expenseService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: SanitizedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenseService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Request() req: { user: SanitizedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expenseService.remove(req.user.id, id);
  }
}
