// src/ais-data/dto/create-vessel-data.dto.ts
import { IsNumber, IsString, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVesselDataDto {
  @IsNumber()
  @Min(100000000)
  @Max(999999999)
  mmsi: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @Min(0)
  @Max(359.9)
  course: number;

  @IsNumber()
  @Min(0)
  speed: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(359.9)
  heading?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  callSign?: string;

  @IsNumber()
  vesselType: number;

  @IsNumber()
  navStatus: number;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  eta?: string;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsNumber()
  length?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsString()
  source?: string = 'telkomsat';
}
