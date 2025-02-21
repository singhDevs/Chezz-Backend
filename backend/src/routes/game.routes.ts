import { Router } from "express";
import { joinGame } from "../controllers/game.controllers";
import { verifyToken } from "../middlewares/auth.middlewares";

const router = Router();

router.post('/join', verifyToken, joinGame);

export default router;