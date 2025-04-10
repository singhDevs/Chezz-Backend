import { Request, Response } from 'express';
import { generateToken, loginUser } from '../auth/auth.js';
import { verifyGoogleToken, findOrCreateUser } from '../auth/googleSignInAuth.js';
import prismaClient from '../services/prismaClient.js';
import dotenv from 'dotenv';
import { createOrGetRatings } from './game.controllers.js';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET as string;


const authUsingEmail = async (req: Request, res: Response) => {
    try {
        const user = await loginUser(req.body.email, req.body.password);
        const token = generateToken(user.id, JWT_SECRET, 60 * 60 * 24 * 7); // 7 days expiry
        res.status(200)
            .json({
                token,
                message: 'User logged in successfully via Email!',
                user: user
            });
    } catch (error: any) {
        res.status(401)
            .json({ error: `Error: ${error}` });
    }
};

const authUsingGoogle = async (req: Request, res: Response) => {
    console.log('Request to Auth using Google received.');
    console.log('Received req.body: ', req.body);
    try {
        const { idToken } = req.body;
        const payload = await verifyGoogleToken(idToken);
        if (payload === undefined) {
            throw new Error('Invalid token!');
        }

        try {
            const user = await findOrCreateUser(payload, prismaClient);
            if (user === undefined || user === null) {
                throw new Error('User not found!');
            }

            const token = generateToken(
                user.id,
                JWT_SECRET,
                60 * 60 * 24 * 7
            );  // 7 days expiry

            console.log('Auth using Google done.');

            res.status(200)
                .json({
                    token,
                    message: 'User logged in successfully via Google!',
                    user: user
                });
        } catch (error) {
            throw new Error('Error finding or creating user! Invalid Payload is the possible culprit.\n' + error);
        }
    } catch (error) {
        res.status(401)
            .json({ error: `Invalid Google token\nDetailed error: ${error}` });
    }
};

export {
    authUsingEmail,
    authUsingGoogle
};