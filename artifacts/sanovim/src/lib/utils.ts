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

/** URL pública do quiz, respeitando o base path do app (import.meta.env.BASE_URL). */
export function quizPublicUrl(slug: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")
  return `${window.location.origin}${base}/q/${slug}`
}

/** Copia texto pra área de transferência de forma segura (retorna sucesso). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fallback abaixo */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const okDeprecated = document.execCommand("copy")
    document.body.removeChild(ta)
    return okDeprecated
  } catch {
    return false
  }
}
