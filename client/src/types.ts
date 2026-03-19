export type Role = "owner" | "editor" | "viewer";

export type User = {
  id: string;
  name: string;
  email: string;
};

export type Permission = {
  user: User;
  role: Role;
};

export type Block = {
  id: string;
  type: "paragraph" | "heading" | "bullet";
  text: string;
  version: number;
};

export type DocumentSummary = {
  id: string;
  title: string;
  role: Role;
  revision: number;
  owner: Pick<User, "name" | "email">;
  permissions: Permission[];
  preview: string;
  updatedAt: string;
  lastActivityAt: string;
};

export type DocumentPayload = {
  id: string;
  title: string;
  role: Role;
  revision: number;
  owner: Pick<User, "name" | "email">;
  permissions: Permission[];
  blocks: Block[];
  updatedAt: string;
  lastActivityAt: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  sender: Pick<User, "name" | "email"> & { id?: string };
  attachment: null | {
    url: string;
    publicId: string;
    originalName: string;
    mimeType: string;
    size: number;
  };
};
