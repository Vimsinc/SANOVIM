import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import trendingRouter from "./trending";
import generateRouter from "./generate";
import imagesRouter from "./images";
import videoRouter from "./video";
import instagramRouter from "./instagram";
import adminRouter from "./admin";
import experienceRouter from "./experience";
import salesRouter from "./sales";
import animationsRouter from "./animations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(trendingRouter);
router.use(generateRouter);
router.use(imagesRouter);
router.use(videoRouter);
router.use(instagramRouter);
router.use("/admin", adminRouter);
router.use(experienceRouter);
router.use("/sales", salesRouter);
router.use(animationsRouter);

export default router;
