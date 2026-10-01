import LoginScreen from "@/components/LoginScreen";

// Cashier sign-in — the default login page. The owner uses the unlisted /owner.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return <LoginScreen role="cashier" error={typeof error === "string" ? error : undefined} />;
}
