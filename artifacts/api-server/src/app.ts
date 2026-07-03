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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

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
    app.get("/q/:slug", async (req: Request, res: Response) => {
      const indexPath = path.join(staticDir, "index.html");
      let html = fs.readFileSync(indexPath, "utf-8");
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        const seo = await buildQuizHead(String(req.params.slug), origin);
        if (seo) {
          html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${seo.title}</title>`);
          html = html.replace("</head>", `${seo.head}\n</head>`);
        }
      } catch {
        // em caso de erro, serve o HTML padrão
      }
      res.type("html").send(html);
    });

    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
}

export default app;
