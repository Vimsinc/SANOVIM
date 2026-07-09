import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
};

// Endpoints públicos (não autenticados) que escrevem/contam — por IP.
export const publicWriteLimiter = rateLimit({
  ...shared,
  windowMs: 60_000, // 1 min
  limit: Number(process.env.RL_PUBLIC_PER_MIN) || 30,
  message: { error: "Muitas requisições. Aguarde alguns instantes e tente de novo." },
});

// Geração por IA — cara (Anthropic/Serper). Por usuário logado.
export const generateLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60_000, // 1 hora
  limit: Number(process.env.RL_GENERATE_PER_HOUR) || 20,
  keyGenerator: (req: Request) =>
    req.user?.email ? `u:${req.user.email}` : ipKeyGenerator(req.ip ?? "0.0.0.0"),
  message: { error: "Limite de gerações por hora atingido. Tente mais tarde." },
});
