import { UserDTO } from "./types";

export function toUserDTO(u: any): UserDTO {
  return {
    id: String(u._id),
    username: u.username,
    displayName: u.displayName,
    gender: u.gender,
    heightCm: u.heightCm ?? null,
  };
}
