"use client"

import { useTheme } from "next-themes"
import { usePathname } from "next/navigation"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // Field app: toasts sit bottom-centre just above whatever owns the bottom of the screen: the 56px tab
  // bar on root tabs, or the sticky action bar (`--jr-bar-top`, published by the field BottomBar) on
  // pushed screens. They never cover the top bar or the primary action, and have no close button (they
  // time out or swipe away). Everywhere else keeps the caller's position.
  const path = usePathname() ?? ""
  const field = path.startsWith("/field")
  const pushed = /^\/field\/visits\/[^/]+/.test(path)
  const fieldBottom = `calc(max(var(--jr-bar-top, 0px), ${pushed ? "0px" : "56px + env(safe-area-inset-bottom)"}) + 12px)`

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
      {...(field ? { position: "bottom-center" as const, closeButton: false, offset: { bottom: fieldBottom }, mobileOffset: { bottom: fieldBottom } } : {})}
    />
  )
}

export { Toaster }
