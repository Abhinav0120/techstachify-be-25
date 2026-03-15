import { IsString, MaxLength, IsOptional, Matches } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a valid hex color (e.g. #ff0000)',
  })
  color?: string;
}
