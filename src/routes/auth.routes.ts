import { Router } from "express";
import { authUsingEmail, authUsingGoogle } from "../controllers/auth.controllers.js";
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

router.route('/email').post(authUsingEmail);
router.route('/google').post(authUsingGoogle);

export default router;