import type { ReactNode } from "react"
import { AlertCircle, Info, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type InlineNoticeVariant = "error" | "notice"

interface InlineNoticeProps {
  variant?: InlineNoticeVariant
  icon?: LucideIcon
  children: ReactNode
  className?: string
}

const configByVariant: Record<
  InlineNoticeVariant,
  { icon: LucideIcon; border: string; iconColor: string }
> = {
  error: {
    icon: AlertCircle,
    border: "border-l-red-500/70 dark:border-l-red-400/70",
    iconColor: "text-red-600 dark:text-red-400",
  },
  notice: {
    icon: Info,
    border: "border-l-gray-400 dark:border-l-gray-500",
    iconColor: "text-gray-500 dark:text-gray-400",
  },
}

/**
 * A quiet, one-line status message. No fill, no shadow, no rounded box.
 *
 * Errors sit behind a hairline left rule in a restrained red and keep
 * role="alert" so screen readers announce them. Notices use the same layout
 * in neutral grey so the difference is structural (icon + role) as well as
 * colour.
 */
export function InlineNotice({
  variant = "notice",
  icon,
  children,
  className,
}: InlineNoticeProps) {
  const config = configByVariant[variant]
  const Icon = icon || config.icon

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      data-inline-notice
      data-variant={variant}
      className={cn(
        "flex items-start gap-3 border-l-2 pl-3 py-0.5 text-sm text-foreground animate-in fade-in-50 duration-300",
        config.border,
        className,
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0 mt-0.5", config.iconColor)}
        aria-hidden="true"
      />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}
