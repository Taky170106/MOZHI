import * as React from "react"
import { cn } from "@/lib/utils"
import { MessageLoading } from "@/components/ui/message-loading"

/**
 * Chat bubbles.
 *
 * The avatar part of the upstream component is deliberately absent: this
 * transcript is a counter log, and the two parties are a visitor and a clerk
 * standing at the same desk. Side and colour carry the direction, which is
 * all a two-party log needs — a face on every line would be noise, and there
 * is no photograph of anyone to show.
 */

interface ChatBubbleProps {
  variant?: "sent" | "received"
  className?: string
  children: React.ReactNode
}

export function ChatBubble({
  variant = "received",
  className,
  children,
}: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col",
        variant === "sent" ? "items-end" : "items-start",
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ChatBubbleMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "sent" | "received"
  isLoading?: boolean
}

export function ChatBubbleMessage({
  variant = "received",
  isLoading,
  className,
  children,
  ...props
}: ChatBubbleMessageProps) {
  return (
    <div
      {...props}
      className={cn(
        "max-w-[88%] rounded-2xl px-4 py-2.5 leading-snug",
        variant === "sent"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground",
        className,
      )}
    >
      {isLoading ? (
        <div className="flex items-center">
          <MessageLoading />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
