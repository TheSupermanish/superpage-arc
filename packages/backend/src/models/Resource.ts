import mongoose, { Schema, Document } from 'mongoose';

export interface IResource extends Document {
  creatorId: mongoose.Types.ObjectId;
  slug?: string;
  type: 'api' | 'file' | 'article' | 'video' | 'shopify';
  name: string;
  description?: string;
  priceUsdc: number;
  tags: string[];
  category?: string;
  config?: Record<string, any>;
  isActive: boolean;
  isPublic: boolean;
  accessCount: number;
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
}

const ResourceSchema = new Schema<IResource>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Creator',
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['api', 'file', 'article', 'video', 'shopify'],
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    priceUsdc: {
      type: Number,
      required: true,
      min: 0,
    },
    tags: {
      // Lowercase, trimmed keywords for marketplace search + category nav.
      type: [String],
      default: [],
      set: (vals: unknown) =>
        Array.isArray(vals)
          ? Array.from(
              new Set(
                vals
                  .map((v) => String(v).toLowerCase().trim())
                  .filter(Boolean)
              )
            )
          : [],
    },
    category: {
      type: String,
      lowercase: true,
      trim: true,
    },
    config: {
      type: Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    accessCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// slug is already indexed via unique: true
ResourceSchema.index({ creatorId: 1, isActive: 1 });
ResourceSchema.index({ creatorId: 1, isPublic: 1 });
ResourceSchema.index({ type: 1 });
ResourceSchema.index({ isActive: 1 });
ResourceSchema.index({ createdAt: -1 });
// Marketplace catalog: tag filtering + keyword search over name/description.
ResourceSchema.index({ tags: 1 });
ResourceSchema.index({ name: "text", description: "text" });

export const Resource = mongoose.model<IResource>('Resource', ResourceSchema);
