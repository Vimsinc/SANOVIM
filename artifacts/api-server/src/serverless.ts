// Entrada serverless (Vercel Functions): monta um app Express ENXUTO com só o
// que o funil precisa — health, auth e /api/sales. Fora ficam vídeo (ffmpeg),
// imagens (sharp) e geração de mídia, que não rodam em serverless. O SPA e o
// SEO de /q são servidos pela hospedagem estática da Vercel.
//
// Um app Express é um handler (req, res) válido para o runtime Node da Vercel,
// então basta exportá-lo como default.
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import salesRouter from "./routes/sales";
import { Router, type IRouter } from "express";

const app: Express = express();

// Atrás do proxy da Vercel — para req.ip refletir o cliente real (rate limit).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// CORS por allowlist (mesma origem não precisa; cross-site só se listado).
const corsAllowlist = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin || corsAllowlist.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(authMiddleware);

// Router do funil montado em /api (a Vercel roteia /api/* para esta função).
const apiRouter: IRouter = Router();
apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use("/sales", salesRouter);
app.use("/api", apiRouter);

// Tratador de erro final: JSON, sem vazar stack.
app.use((err: unknown, req: Request, res: Response, _next: express.NextFunction) => {
  req.log?.error({ err }, "unhandled route error");
  if (res.headersSent) return;
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    500;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: "Erro interno" });
});

export default app;
