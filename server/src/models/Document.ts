import mongoose, { InferSchemaType, Schema } from "mongoose";

export const permissionRoles = ["owner", "editor", "viewer"] as const;
export type PermissionRole = (typeof permissionRoles)[number];

const blockSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["paragraph", "heading", "bullet"],
      default: "paragraph",
    },
    text: {
      type: String,
      default: "",
    },
    version: {
      type: Number,
      default: 1,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false },
);

const permissionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: permissionRoles,
      required: true,
    },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    permissions: {
      type: [permissionSchema],
      default: [],
    },
    blocks: {
      type: [blockSchema],
      default: [],
    },
    revision: {
      type: Number,
      default: 1,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

documentSchema.index({ owner: 1 });
documentSchema.index({ "permissions.user": 1 });

export type DocumentRecord = InferSchemaType<typeof documentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DocumentModel = mongoose.model("Document", documentSchema);
