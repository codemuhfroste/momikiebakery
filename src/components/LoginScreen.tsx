import { loginAction } from "@/app/actions";
import { isRelaxedLogin, type LoginRole } from "@/lib/auth";
import SubmitButton from "./SubmitButton";

// Background video for the brand panel (public/newbgmomikie.mp4). Set to null
// to show the plain green background instead.
const LOGIN_VIDEO_SRC: string | null = "/newbgmomikie.mp4";

const ERRORS: Record<string, string> = {
  "1": "That PIN isn't right. Please try again.",
  locked: "Too many incorrect PINs from this network. Try again in an hour.",
};

const COPY: Record<LoginRole, { heading: string; subheading: string; button: string }> = {
  cashier: {
    heading: "Cashier sign in",
    subheading: "Enter your cashier PIN to open the register and record sales and credit payments.",
    button: "Sign in",
  },
  owner: {
    heading: "Owner sign in",
    subheading: "Enter the owner PIN for full access, including products, inventory, and the audit log.",
    button: "Sign in as owner",
  },
};

// Same layout as Gemellus Cashflow: a brand panel (video over a green
// background) beside the PIN form on wide screens, becoming a header
// band above it on phones. The "Dev" badge marks local/preview builds, where
// the PIN length rule and lockout are relaxed (see isRelaxedLogin).
export default function LoginScreen({ role, error }: { role: LoginRole; error?: string }) {
  const isDev = isRelaxedLogin();
  const copy = COPY[role];
  const message = error ? ERRORS[error] ?? ERRORS["1"] : undefined;

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-emerald-800 px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12">
        {LOGIN_VIDEO_SRC && (
          // motion-reduce:hidden — people who've asked their OS to cut
          // motion get the plain green background instead.
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
            src={LOGIN_VIDEO_SRC}
          />
        )}
        {/* Scrim keeps the text readable over whatever is in the footage. */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/70 via-emerald-900/40 to-emerald-700/30" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-accent font-serif text-xl font-bold text-sidebar shadow-lg shadow-black/20">
            M
          </span>
          <span className="leading-tight">
            <span className="block text-xl font-bold tracking-tight">Momikie&apos;s</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              General Merchandise
            </span>
          </span>
          {isDev && (
            <span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-white/30">
              Dev
            </span>
          )}
        </div>

        <div className="relative hidden max-w-md animate-rise-in [animation-delay:120ms] lg:block">
          <p className="text-4xl font-bold leading-tight tracking-tight">
            Momikie&apos;s General Merchandise
          </p>
          <p className="mt-4 text-base text-white/80">
            All in one sales, credit and inventory management.
          </p>
        </div>

        <p className="relative mt-6 hidden text-sm text-white/85 drop-shadow lg:block">
          Developed by <span className="font-semibold text-white">JM Labalan</span>
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm animate-rise-in">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              {role === "owner" ? (
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4" />
              ) : (
                <path d="M4 6h16v12H4zM4 10h16M8 15h3" />
              )}
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">{copy.heading}</h1>
          <p className="mt-2 text-sm text-muted">{copy.subheading}</p>

          <form action={loginAction} className="mt-8 space-y-5">
            <input type="hidden" name="role" value={role} />
            <div>
              <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-ink">
                PIN
              </label>
              <input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                autoFocus
                placeholder="••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3.5 text-center text-xl tracking-[0.5em] text-ink outline-none transition placeholder:text-slate-300 focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </div>

            {message && (
              <p role="alert" className="animate-shake rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {message}
              </p>
            )}

            <SubmitButton
              pendingLabel="Checking PIN…"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3.5 font-semibold text-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-lg active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:opacity-80"
            >
              {copy.button}
            </SubmitButton>
          </form>

          <p className="mt-10 text-xs text-slate-400 lg:hidden">
            Developed by <span className="font-semibold text-slate-500">JM Labalan</span>
          </p>
        </div>
      </main>
    </div>
  );
}
