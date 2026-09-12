import { useEffect, useState } from "react";

type Phase = "entering" | "exiting" | "done";

/**
 * Full-screen splash shown while the first page and its visual assets load.
 *
 * It intentionally renders during SSR, preventing the report page from
 * flashing behind the splash before React hydrates in LINE WebView.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("entering");

  useEffect(() => {
    let active = true;
    let exitStarted = false;
    let exitTimer = 0;
    let doneTimer = 0;
    let safetyTimer = 0;
    const startedAt = performance.now();
    const beginExit = () => {
      if (!active || exitStarted) return;
      exitStarted = true;
      window.clearTimeout(safetyTimer);
      setPhase("exiting");
      doneTimer = window.setTimeout(() => active && setPhase("done"), 500);
    };

    const waitForWindow =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            window.addEventListener("load", () => resolve(), { once: true }),
          );
    const waitForFonts = document.fonts?.ready?.then(() => undefined) || Promise.resolve();
    const background = new Image();
    background.src = "/dragon-background.png";
    const waitForBackground = background.decode?.().catch(() => undefined) || Promise.resolve();

    void Promise.all([waitForWindow, waitForFonts, waitForBackground]).then(() => {
      if (!active) return;
      const remainingMinimum = Math.max(0, 1_250 - (performance.now() - startedAt));
      exitTimer = window.setTimeout(beginExit, remainingMinimum);
    });

    // Do not trap the user on the splash if an optional remote asset stalls.
    safetyTimer = window.setTimeout(beginExit, 5_000);

    return () => {
      active = false;
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      window.clearTimeout(safetyTimer);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex h-[100dvh] min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#001507] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] isolate select-none ${
        phase === "exiting" ? "splash-exit" : ""
      }`}
      style={{ backgroundColor: "#001507" }}
    >
      {/* Blurred cover fills the portrait space above and below the sharp landscape artwork. */}
      <div
        className="absolute -inset-16 z-0 scale-125 bg-cover bg-center opacity-100 blur-2xl"
        style={{ backgroundImage: "url(/dragon-background.png)" }}
      />
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#001507]/80 via-[#001507]/25 to-[#001507]/85" />

      {/* The original artwork stays fully visible and correctly proportioned in the center. */}
      <img
        src="/dragon-background.png"
        alt=""
        className="absolute inset-0 z-[2] h-full w-full object-contain opacity-95"
      />
      <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/15 via-transparent to-black/25" />

      {/* Animated tiger stripe background */}
      <div className="tiger-stripes-animated absolute inset-0 z-[4] opacity-[0.06]" />

      {/* Radial glow behind the logo */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "260px",
          height: "260px",
          background: "radial-gradient(circle, oklch(0.76 0.15 84 / 18%) 0%, transparent 70%)",
        }}
      />

      {/* Center content */}
      <div className="relative z-10 flex max-w-[min(92vw,26rem)] flex-col items-center gap-5 px-7 py-8 drop-shadow-[0_8px_24px_rgba(0,0,0,0.72)]">
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
            เช็คยอดกองร้อยที่ 4
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
        <div className="overflow-hidden rounded-full" style={{ width: "120px", height: "3px" }}>
          <div
            className="bar-fill h-full w-full rounded-full gold-gradient"
            style={{ animationDelay: "580ms" }}
          />
        </div>
      </div>
    </div>
  );
}
