import type { Awareness } from "y-protocols/awareness";
import type { Team } from "@/types/veto";

export interface VetoAwarenessUser {
  name: string;
  color: string;
  role: Team | "spectator";
  selectedMapId?: string | null;
}

export interface AwarenessState {
  user?: VetoAwarenessUser;
}

export function setLocalAwareness(awareness: Awareness, user: VetoAwarenessUser): void {
  awareness.setLocalStateField("user", user);
}

export function updateSelectedMap(awareness: Awareness, mapId: string | null): void {
  const current = (awareness.getLocalState() as AwarenessState | null)?.user;
  if (!current) return;
  awareness.setLocalStateField("user", { ...current, selectedMapId: mapId });
}

export function getRemoteAwareness(awareness: Awareness): Map<number, VetoAwarenessUser> {
  const states = awareness.getStates();
  const localId = awareness.clientID;
  const remoteUsers = new Map<number, VetoAwarenessUser>();

  states.forEach((state, clientId) => {
    if (clientId !== localId && (state as AwarenessState).user) {
      remoteUsers.set(clientId, (state as AwarenessState).user as VetoAwarenessUser);
    }
  });

  return remoteUsers;
}
