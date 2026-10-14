/**
 * Browser notifications for followed chats while the page is in the background.
 */
import { useEffect } from "react";
import type { FolioComment } from "@folio/core";
import { notifyFollowed } from "../comments/Chat";
import { subscribe } from "../stream/client";

/** Raise a notification when someone else writes in a chat the user follows. */
export function useFollowNotifications(): void {
  useEffect(() => {
    const seen = new Map<string, number>();
    return subscribe(["*"], (m) => (m.type === "comment" ? notifyFollowed((m.data as { comment: FolioComment }).comment, seen) : undefined));
  }, []);
}
