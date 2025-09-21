// src/ais-data/dto/query-poi-area.dto.ts
import { IsNumber, IsOptional, IsDateString, IsEnum, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryPOIAreaDto {
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) => parseFloat(value))
  minLongitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) => parseFloat(value))
  maxLongitude: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) => parseFloat(value))
  minLatitude: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) => parseFloat(value))
  maxLatitude: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['vessel', 'ais', 'track', 'all'])
  dataType?: string = 'vessel';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 100; // ✅ Fixed 100 per page

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  autoFetch?: boolean = false; // ✅ Flag untuk otomatisasi
}

export class POIAreaCountDto {
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  minLongitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  maxLongitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  minLatitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  maxLatitude: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['vessel', 'ais', 'track', 'all'])
  dataType?: string = 'vessel';
}
