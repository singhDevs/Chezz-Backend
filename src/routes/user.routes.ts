import { Router } from "express";
import { getProfile } from "../controllers/user.controllers.js";

const router = Router();

router.get('/profile', getProfile);

export default router;
