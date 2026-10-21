"use client"

import { useTheme } from "next-themes"
import { usePathname } from "next/navigation"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // Field app: toasts sit bottom-centre above the 56px tab bar + safe area, so they never cover the
  // top bar. Everywhere else keeps the caller's position.
  const path = usePathname() ?? ""
  const field = path.startsWith("/field")
  // Pushed field screens (a visit and its sale flow) have no tab bar: their sticky action bar owns the
  // bottom of the screen, so toasts sit just under the 48px top bar instead of covering the primary action.
  const pushed = /^\/field\/visits\/[^/]+/.test(path)
  const fieldBottom = "calc(56px + env(safe-area-inset-bottom) + 12px)"

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
      {...(pushed ? { position: "top-center" as const, offset: { top: 56 }, mobileOffset: { top: 56 } }
        : field ? { position: "bottom-center" as const, offset: { bottom: fieldBottom }, mobileOffset: { bottom: fieldBottom } } : {})}
    />
  )
}

export { Toaster }
