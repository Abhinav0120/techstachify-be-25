import {
  IsNumber,
  IsString,
  IsDateString,
  IsPositive,
  IsInt,
  MaxLength,
} from 'class-validator';

export class CreateExpenseDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsDateString()
  date: string;

  @IsInt()
  categoryId: number;
}
