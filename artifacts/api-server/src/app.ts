import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(authMiddleware);

app.use("/api", router);

// Tratador de erro final: responde JSON e evita vazar stack trace ao cliente.
app.use((err: unknown, req: Request, res: Response, _next: express.NextFunction) => {
  req.log?.error({ err }, "unhandled route error");
  if (res.headersSent) return;
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
    ?? 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: "Erro interno" });
});

export async function setupViteDevMiddleware(app: Express): Promise<void> {
  const { createServer } = await import("vite");
  const sanovimRoot = path.resolve(__dirname, "../../sanovim");
  const vite = await createServer({
    root: sanovimRoot,
    configFile: path.join(sanovimRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

export async function setupStaticServing(app: Express): Promise<void> {
  const staticDir = path.resolve(__dirname, "../../sanovim/dist/public");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));

    // SEO: injeta title + meta tags + JSON-LD por quiz na página pública.
    // Precede o catch-all para que crawlers e prévias de link recebam o HTML certo.
    const { buildQuizHead } = await import("./lib/salesSeo");
    const indexPath = path.join(staticDir, "index.html");
    // Lê o index.html uma vez (evita fs.readFileSync bloqueante a cada request).
    let baseHtml: string | null = null;
    try {
      baseHtml = fs.readFileSync(indexPath, "utf-8");
    } catch {
      baseHtml = null;
    }
    // Origem canônica: prioriza PUBLIC_BASE_URL (evita Host header injection).
    const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
    app.get("/q/:slug", async (req: Request, res: Response, next) => {
      if (!baseHtml) {
        next();
        return;
      }
      let html = baseHtml;
      try {
        const origin = publicBase || `${req.protocol}://${req.get("host")}`;
        const seo = await buildQuizHead(String(req.params.slug), origin);
        if (seo) {
          // Substituições via função para não interpretar "$" como padrão de replace
          html = html.replace(/<html\b[^>]*>/i, () => '<html lang="pt-BR">');
          html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${seo.title}</title>`);
          html = html.replace("</head>", () => `${seo.head}\n</head>`);
        }
      } catch {
        // em caso de erro, serve o HTML padrão
      }
      res.type("html").send(html);
    });

    // Catch-all do SPA. Express 5 (path-to-regexp v8) não aceita mais "*" como
    // string; usamos um regex que casa qualquer caminho.
    app.get(/.*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
}

export default app;
