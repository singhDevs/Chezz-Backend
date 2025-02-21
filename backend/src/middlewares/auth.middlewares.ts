import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from "express";
import dotenv from 'dotenv';
dotenv.config();

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET as string, (error, decoded) => {
        if (error) {
            if (error.name === 'TokenExpiredError') {
                res.status(401).json({ error: 'Token expired' });
            }
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        if (!decoded || typeof decoded !== 'object') {
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        console.log("Verification done!");
        req.user = {
            id: decoded.userId,
        }
        req.headers['x-validation-token'] = token;
        
        next();
    });
};

export{ verifyToken };