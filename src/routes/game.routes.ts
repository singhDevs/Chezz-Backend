import { Router } from "express";
import { joinGame } from "../controllers/game.controllers.js";
import { verifyToken } from "../middlewares/auth.middlewares.js";

const router = Router();

router.post('/join', verifyToken, joinGame);

export default router;