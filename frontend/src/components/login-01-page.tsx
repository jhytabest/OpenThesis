import { LoginForm } from "@/components/login-form";

interface Login01PageProps {
  errorMessage?: string;
}

export function Login01Page({ errorMessage }: Login01PageProps) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm errorMessage={errorMessage} />
      </div>
    </div>
  );
}
