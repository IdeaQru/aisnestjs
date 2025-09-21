// src/ais-data/dto/query-vessel-log.dto.ts
import { IsOptional, IsNumber, IsDateString, IsString, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryVesselLogDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  mmsi?: number;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : [Number(value)])
  mmsis?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 100;

  @IsOptional()
  @IsString()
  sortBy?: string = 'timestamp';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  source?: string;
}
