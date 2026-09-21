import { createFileRoute } from "@tanstack/react-router";
import { FlyApp } from "@/fly/FlyApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="h-dvh w-full bg-void">
      <FlyApp />
    </main>
  );
}
