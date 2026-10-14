/**
 * ThemeSwitch: Light, Dark or System for the chrome, kept in `localStorage`
 * under `folio-theme` and applied as `data-theme` on `<html>`. The inline
 * script in `index.html` applies the stored choice before first paint; this
 * control changes it and follows the system scheme while System is chosen.
 */
import { DropdownMenu } from "radix-ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "./cn";
import { Tip } from "./tooltip";

type Choice = "light" | "dark" | "system";

const STORAGE_KEY = "folio-theme";
const CHOICES: { value: Choice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const darkQuery = () => matchMedia("(prefers-color-scheme: dark)");

function storedChoice(): Choice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

function store(choice: Choice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {}
}

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && darkQuery().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/**
 * The theme control: an icon button opening Light, Dark and System.
 *
 * @param props.className - extra classes for the button.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useState<Choice>(storedChoice);
  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const query = darkQuery();
    const follow = () => apply("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [choice]);
  const choose = (value: string) => (store(value as Choice), setChoice(value as Choice));
  const Current = CHOICES.find((c) => c.value === choice)!.icon;
  return (
    <DropdownMenu.Root>
      <Tip label="Theme">
        <DropdownMenu.Trigger aria-label="Theme" className={cn("flex size-8 items-center justify-center rounded-control text-ink hover:bg-whisper [&_svg]:size-4", className)}>
          <Current />
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-[30] min-w-32 rounded-menu border border-line bg-surface p-1 text-[12px] text-ink shadow-[var(--glass-lift)]">
          <DropdownMenu.RadioGroup value={choice} onValueChange={choose}>
            {CHOICES.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem key={value} value={value} className="flex h-7 cursor-default items-center gap-2 rounded-control px-2.5 text-ink-muted outline-none data-[highlighted]:bg-whisper data-[state=checked]:bg-ash data-[state=checked]:text-ink [&_svg]:size-3.5">
                <Icon />
                {label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
