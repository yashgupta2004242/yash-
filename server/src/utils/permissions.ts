import type { PermissionRole } from "../models/Document.js";

export const roleRank: Record<PermissionRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

type RoleSource = {
  owner:
    | { toString(): string }
    | { _id?: { toString(): string }; id?: string; toString(): string };
  permissions: Array<{
    user:
      | { toString(): string }
      | { _id?: { toString(): string }; id?: string; toString(): string };
    role: PermissionRole;
  }>;
};

const extractId = (
  value:
    | { toString(): string }
    | { _id?: { toString(): string }; id?: string; toString(): string },
) => {
  if ("id" in value && typeof value.id === "string") {
    return value.id;
  }

  if ("_id" in value && value._id) {
    return value._id.toString();
  }

  return value.toString();
};

export const getRoleForUser = (
  document: RoleSource,
  userId: string,
): PermissionRole | null => {
  if (extractId(document.owner) === userId) {
    return "owner";
  }

  const permission = document.permissions.find(
    (entry) => extractId(entry.user) === userId,
  );

  return permission?.role ?? null;
};

export const canEdit = (role: PermissionRole | null) =>
  role === "owner" || role === "editor";

export const canChat = canEdit;
