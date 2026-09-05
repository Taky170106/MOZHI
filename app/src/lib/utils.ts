import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class helper: merges conditional classes and resolves
 *  conflicting Tailwind utilities so the last one wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
