// src/ais-data/schemas/vessel-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VesselLogDocument = VesselLog & Document;

@Schema({ 
  timestamps: true,
  collection: 'vessel_logs'
})
export class VesselLog {
  @Prop({ required: true, index: true })
  mmsi: number;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;

  @Prop({ required: true })
  course: number;

  @Prop({ required: true })
  speed: number;

  @Prop()
  heading?: number;

  @Prop()
  name?: string;

  @Prop()
  callSign?: string;

  @Prop({ required: true })
  vesselType: number;

  @Prop({ required: true })
  navStatus: number;

  @Prop()
  destination?: string;

  @Prop()
  eta?: string;

  @Prop({ required: true, index: true })
  timestamp: Date;

  @Prop()
  length?: number;

  @Prop()
  width?: number;

  @Prop({ required: true, default: 'telkomsat' })
  source: string;

  // Metadata untuk archival
  @Prop({ required: true })
  archivedAt: Date;

  @Prop({ required: true })
  archiveReason: string; // 'scheduled_update', 'manual_archive', etc.

  @Prop({ 
    type: String, 
    enum: ['active', 'archived', 'purged'],
    default: 'archived'
  })
  status: string;
}

export const VesselLogSchema = SchemaFactory.createForClass(VesselLog);

// Indexes untuk performance queries dan playback
VesselLogSchema.index({ mmsi: 1, timestamp: -1 });
VesselLogSchema.index({ timestamp: -1 });
VesselLogSchema.index({ archivedAt: -1 });
VesselLogSchema.index({ status: 1 });

// Compound index untuk range queries
VesselLogSchema.index({ 
  mmsi: 1, 
  timestamp: -1, 
  status: 1 
}, { 
  name: 'vessel_playback_index' 
});

// Geospatial index untuk location-based queries
VesselLogSchema.index({ 
  latitude: 1, 
  longitude: 1, 
  timestamp: -1 
}, { 
  name: 'geo_temporal_index' 
});
