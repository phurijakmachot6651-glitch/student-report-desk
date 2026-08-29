import { useEffect, useState } from "react";

const STORAGE_KEY = "splash-shown";

type Phase = "entering" | "exiting" | "done";

/**
 * Full-screen tiger-themed splash screen shown once per browser session.
 *
 * Renders nothing on the server (or if already shown this session) so
 * there is no SSR/hydration mismatch.
 *
 * Timeline:
 *   t=0ms     logo animates in (logo-glow-in)
 *   t=250ms   app name reveals up
 *   t=420ms   subtitle reveals up
 *   t=580ms   gold bar sweeps in (bar-fill)
 *   t=1300ms  → exiting: splash-exit plays (500ms)
 *   t=1800ms  → done: component unmounts
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    // Guard: skip on SSR and skip if already shown this session.
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setPhase("done");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage unavailable (private/sandboxed) — skip splash.
      setPhase("done");
      return;
    }

    setPhase("entering");

    const exitTimer = window.setTimeout(() => setPhase("exiting"), 1300);
    const doneTimer = window.setTimeout(() => setPhase("done"), 1800);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  // Not yet mounted or already finished — render nothing.
  if (phase === null || phase === "done") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none ${
        phase === "exiting" ? "splash-exit" : ""
      }`}
      style={{
        backgroundImage: "url(/dragon-background.png)",
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay for readability */}
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: "oklch(0.13 0.03 84)" }}
      />

      {/* Animated tiger stripe background */}
      <div className="tiger-stripes-animated absolute inset-0 opacity-15" />

      {/* Radial glow behind the logo */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "260px",
          height: "260px",
          background:
            "radial-gradient(circle, oklch(0.76 0.15 84 / 18%) 0%, transparent 70%)",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-5">
        {/* Dragon logo */}
        <img
          src="/dragon_logo.png"
          alt=""
          className="logo-glow-in h-20 w-20 rounded-full object-contain"
          style={{
            boxShadow: "0 0 18px 4px oklch(0.76 0.15 84 / 30%)",
            border: "2px solid oklch(0.76 0.15 84 / 50%)",
          }}
        />

        {/* Text stack */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1
            className="reveal-stagger gold-text text-2xl font-extrabold tracking-tight sm:text-3xl"
            style={{ "--i": 0, animationDelay: "250ms" } as React.CSSProperties}
          >
            ยอดกำลังพล นรต.
          </h1>

          <p
            className="reveal-stagger text-sm font-medium"
            style={
              {
                "--i": 0,
                animationDelay: "420ms",
                color: "oklch(0.65 0.2 145 / 90%)",
              } as React.CSSProperties
            }
          >
            กองร้อยที่ ๔ ฝ่ายปกครอง ๑
          </p>
        </div>

        {/* Gold sweep bar */}
        <div
          className="overflow-hidden rounded-full"
          style={{ width: "120px", height: "3px" }}
        >
          <div
            className="bar-fill h-full w-full rounded-full gold-gradient"
            style={{ animationDelay: "580ms" }}
          />
        </div>
      </div>
    </div>
  );
}
