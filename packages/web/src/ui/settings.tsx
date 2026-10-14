/**
 * Settings: a list of rows, each a label and its control, and the switch most
 * rows hold. A later setting is one more row.
 */
import { Switch } from "radix-ui";
import { useId, type ReactNode } from "react";

export interface SettingsRow {
  label: string;
  control: (id: string) => ReactNode;
}

/**
 * The rows, one per setting.
 *
 * @param props.rows - a label and a control for each setting; the control receives the id its label points at.
 * @param props.label - the list's accessible name.
 */
export function SettingsList({ rows, label }: { rows: SettingsRow[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col">
      {rows.map((r) => <Row key={r.label} row={r} />)}
    </ul>
  );
}

function Row({ row }: { row: SettingsRow }) {
  const id = useId();
  return (
    <li className="flex min-h-9 items-center justify-between gap-6 px-2.5">
      <label htmlFor={id} className="text-[12px] text-ink">{row.label}</label>
      {row.control(id)}
    </li>
  );
}

/**
 * An on/off switch as a small pill.
 *
 * @param props.checked - whether it is on.
 * @param props.onChange - called with the new state.
 * @param props.disabled - holds the switch where it is.
 */
export function Toggle({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      className="relative h-5 w-8 shrink-0 rounded-full bg-ink/45 transition-colors duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=checked]:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:translate-x-3.5" />
    </Switch.Root>
  );
}
