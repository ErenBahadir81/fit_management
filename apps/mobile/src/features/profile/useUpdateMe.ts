import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateMeInput, UserDTO } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { useSession } from "../auth/session";

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
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) useSession.getState().setUser(ctx.prev);
      toast.show({ message: describeError(e, "Kaydedilemedi. Tekrar dene."), kind: "error" });
    },
    onSuccess: (user) => {
      useSession.getState().setUser(user);
      void haptic.select();
      // Measurement day, activity level, height and gender feed every composite (week bounds, TDEE,
      // targets, schedule); profile edits are rare, so refresh everything rather than guess.
      void qc.invalidateQueries();
    },
  });
}
