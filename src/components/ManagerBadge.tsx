import type { Manager } from "@/types/database";

export function ManagerBadge({
  manager,
  size = "md",
}: {
  manager: Manager;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "h-10 w-10 text-base" : size === "sm" ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm";
  const initial = manager.display_name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex ${dims} shrink-0 items-center justify-center rounded-full font-display uppercase text-white`}
        style={{ backgroundColor: manager.accent_color }}
      >
        {initial}
      </div>
      <span className="font-medium text-ink">{manager.display_name}</span>
    </div>
  );
}
