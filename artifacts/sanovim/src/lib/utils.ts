import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Monta um link wa.me a partir de um telefone (BR), assumindo DDI 55 quando
 * o número tem só DDD + número (<= 11 dígitos).
 */
export function waLink(phone: string, message: string): string {
  const num = phone.replace(/\D/g, "")
  const withCc = num.length <= 11 ? `55${num}` : num
  return `https://wa.me/${withCc}?text=${encodeURIComponent(message)}`
}
