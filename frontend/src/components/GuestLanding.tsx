import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GuestLanding() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader className="space-y-4">
          <img src="/brand/alexclaw-logo-192.png" alt="Alexclaw logo" width={96} height={96} />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Alexclaw Research Hub</p>
          <CardTitle className="text-3xl">Your thesis workspace, now shadcn-native.</CardTitle>
          <CardDescription>
            Create a project with thesis text and background research starts automatically. Use dashboard,
            explorer, reading list, and chat in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Project-scoped papers, memory docs, and chats.</li>
            <li>Integrated notes, comments, and reading workflow.</li>
            <li>Background refreshes while you keep writing.</li>
          </ul>

          <Button asChild>
            <a href="/auth/google">Sign in with Google</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
