import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "../actions";

export default function SignupPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
