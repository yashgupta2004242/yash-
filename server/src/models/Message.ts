import mongoose, { InferSchemaType, Schema } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    attachment: {
      type: attachmentSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type MessageRecord = InferSchemaType<typeof messageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MessageModel = mongoose.model("Message", messageSchema);
