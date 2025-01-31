import { Request, Response } from 'express';
import { generateToken, loginUser } from '../auth/auth';
import { verifyGoogleToken, findOrCreateUser } from '../auth/googleSignInAuth';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET as string;


const authUsingEmail = async (req: Request, res: Response) => {
    try {
        const user = await loginUser(req.body.email, req.body.password);
        const token = generateToken(user.id, JWT_SECRET, 60 * 60 * 24 * 7); // 7 days expiry
        res.status(200)
            .json({
                token,
                message: 'User logged in successfully via Email!',
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    authMethod: user.authMethod
                }
            });
    } catch (error: any) {
        res.status(401)
            .json({ error: `Error: ${error}` });
    }
};

const authUsingGoogle = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;
        const payload = await verifyGoogleToken(idToken);
        if (payload === undefined) {
            throw new Error('Invalid token!');
        }

        try {
            const user = await findOrCreateUser(payload, prisma);
            const token = generateToken(
                user.id,
                JWT_SECRET,
                60 * 60 * 24 * 7
            );  // 7 days expiry

            res.status(200)
                .json({
                    token,
                    message: 'User logged in successfully via Google!',
                    user: {
                        id: user.id,
                        email: user.email,
                        username: user.username
                    }
                });
        } catch (error) {
            throw new Error('Error finding or creating user! Invalid Payload is the possible culprit.\n' + error);
        }
    } catch (error) {
        res.status(401)
            .json({ error: `Invalid Google token\nDetailed error: ${error}` });
    }
};

export{
    authUsingEmail,
    authUsingGoogle
};