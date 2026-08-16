import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="signin" action={signIn} next={next} />;
}
