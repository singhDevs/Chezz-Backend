import { Router } from "express";
import { joinGame, getGames, getPGN } from "../controllers/game.controllers.js";
import { verifyToken } from "../middlewares/auth.middlewares.js";

const router = Router();

router.post('/join', verifyToken, joinGame);
router.get('/history', verifyToken, getGames);
router.get('/pgn', verifyToken, getPGN);

export default router;