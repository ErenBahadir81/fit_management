import { UserAdminDTO, UserDTO } from "./types";

export function toUserDTO(u: any): UserDTO {
  return {
    id: String(u._id),
    username: u.username,
    displayName: u.displayName,
    gender: u.gender,
    heightCm: u.heightCm ?? null,
    role: u.role === "admin" ? "admin" : "user",
  };
}

export function toUserAdminDTO(u: any): UserAdminDTO {
  return {
    ...toUserDTO(u),
    password: u.passwordPlain ?? null,
    createdAt: new Date(u.createdAt ?? Date.now()).toISOString(),
  };
}
