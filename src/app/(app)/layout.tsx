import { TopNav } from "@/components/TopNav";

/* No max-width here on purpose — the draft room needs a wide board while
   the matchup and season pages want a reading column. Each page sets its
   own container. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <TopNav />
      <main className="w-full flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
