import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { themeInitScript } from "@/lib/theme";
import { SplashScreen } from "@/components/splash-screen";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="tiger-stripes pointer-events-none absolute inset-0 opacity-40" />
      <div className="reveal relative max-w-md text-center">
        <h1 className="gold-text text-8xl font-extrabold tracking-tight">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">ไม่พบหน้าที่ต้องการ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          หน้านี้อาจถูกย้ายหรือไม่มีอยู่ในระบบ
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="tiger-stripes pointer-events-none absolute inset-0 opacity-40" />
      <div className="reveal relative max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          โหลดหน้านี้ไม่สำเร็จ
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          เกิดข้อผิดพลาดบางอย่าง ลองรีเฟรชใหม่หรือกลับหน้าแรก
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
          >
            ลองใหม่
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium text-foreground transition-all hover:bg-accent hover:border-primary/40 active:scale-[0.97]"
          >
            กลับหน้าแรก
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "เช็คยอดกองร้อยที่ 4" },
      { name: "description", content: "เช็คยอดกองร้อยที่ 4" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "เช็คยอดกองร้อยที่ 4" },
      { property: "og:description", content: "เช็คยอดกองร้อยที่ 4" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "เช็คยอดกองร้อยที่ 4" },
      { name: "twitter:description", content: "เช็คยอดกองร้อยที่ 4" },
      {
        property: "og:image",
        content: "https://student-report-desk-red.vercel.app/og-image.jpg",
      },
      {
        name: "twitter:image",
        content: "https://student-report-desk-red.vercel.app/og-image.jpg",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen />
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
