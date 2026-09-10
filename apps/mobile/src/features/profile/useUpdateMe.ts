import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateMeInput, UserDTO } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { useSession } from "../auth/session";
import { HOME_QUERY_KEY } from "../home/useHome";

/** PATCH /me with an optimistic session update and rollback + toast on failure. */
export function useUpdateMe() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<UserDTO, unknown, UpdateMeInput, { prev: UserDTO | null }>({
    mutationFn: async (patch) => (await getApi().me.update(patch)).user,
    onMutate: (patch) => {
      const prev = useSession.getState().user;
      if (prev) useSession.getState().setUser({ ...prev, ...patch } as UserDTO);
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) useSession.getState().setUser(ctx.prev);
      toast.show({ message: "Kaydedilemedi. Tekrar dene.", kind: "error" });
    },
    onSuccess: (user) => {
      useSession.getState().setUser(user);
      void haptic.select();
      void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    },
  });
}
