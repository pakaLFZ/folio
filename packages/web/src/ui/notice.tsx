/**
 * Notice: one transient glass card at the top of the scene, centred between
 * the open panes just below the top row (`.notice` in styles.css), sliding
 * in from above. `role="status"`, monochrome, no dismiss button. Only the latest message is shown. A busy
 * notice (work under way) stays until the next one replaces it.
 */
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type NoticeTone = "ok" | "error" | "busy";
export interface NoticeMessage {
  text: string;
  at: number;
  tone: NoticeTone;
  /** How long it stays; two seconds by default, six for an error. */
  ms?: number;
}

const ICONS = { ok: Check, error: AlertTriangle, busy: LoaderCircle };

/**
 * Show a notice for two seconds (errors for six, busy until replaced).
 *
 * @param props.notice - the latest notice, or null.
 */
export function Notice({ notice }: { notice: NoticeMessage | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    if (notice.tone === "busy") return;
    const t = setTimeout(() => setVisible(false), notice.ms ?? (notice.tone === "error" ? 6000 : 2000));
    return () => clearTimeout(t);
  }, [notice]);
  const Icon = notice ? ICONS[notice.tone] : Check;
  return (
    <div role="status" aria-live="polite" className="notice">
      {notice && visible ? (
        <div key={notice.at} className="notice-card glass flex max-w-[36rem] items-center gap-2 rounded-menu px-4 py-2 text-[13px]">
          <Icon className={notice.tone === "busy" ? "size-4 shrink-0 animate-spin motion-reduce:animate-none" : "size-4 shrink-0"} />
          <span>{notice.text}</span>
        </div>
      ) : null}
    </div>
  );
}
