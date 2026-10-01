import LoginScreen from "@/components/LoginScreen";

// Owner sign-in. Not linked anywhere in the app; go to /owner directly.
export default async function OwnerLoginPage({ searchParams }: PageProps<"/owner">) {
  const { error } = await searchParams;
  return <LoginScreen role="owner" error={typeof error === "string" ? error : undefined} />;
}
