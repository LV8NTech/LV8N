import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metaHiringRouter from "./meta-hiring";

const router: IRouter = Router();

router.use(healthRouter);
router.use(metaHiringRouter);

export default router;
