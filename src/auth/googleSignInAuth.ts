import { PrismaClient } from "@prisma/client";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import dotenv from 'dotenv';
import { createOrGetRatings } from "../controllers/game.controllers.js";

dotenv.config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(paramidToken: string) {
    const ticket = await client.verifyIdToken({
        idToken: paramidToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
}

export const findOrCreateUser = async (payload: TokenPayload, prisma: PrismaClient) => {
    if (payload === undefined || payload.email === undefined || payload.sub === undefined) {
        throw new Error('Invalid payload!');
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { email: payload.email, authMethod: 'GOOGLE' },
                { googleId: payload.sub }
            ]
        },
        select: {
            id: true,
            email: true,
            username: true,
            photoUrl: true,
            createdAt: true,
            ratings: {
                select: {
                    bulletRating: true,
                    blitzRating: true,
                    rapidRating: true
                }
            },
            totalGames: true,
            totalWins: true,
            totalLosses: true,
            totalDraws: true,
            totalTimePlayed: true,
        }
    })
    if (existingUser) return existingUser;

    const baseUsername = payload.email.split('@')[0];
    let username = baseUsername;
    let counter = 1;

    while (true) {
        const exists = await prisma.user.findUnique({
            where: { username }
        });

        if (!exists) break;
        username = `${baseUsername}${counter++}`;
    }


    const user = await prisma.user.create({
        data: {
            email: payload.email,
            googleId: payload.sub,
            username: username,
            authMethod: 'GOOGLE',
            photoUrl: payload.picture
        }
    })

    const rating = await createOrGetRatings(user.id);
    await prisma.user.update({
        where: { id: user.id },
        data: {
            ratings: {
                connect: { userId: rating.userId }
            }
        }
    });

    return await prisma.user.findUnique({
        where: { id: user.id },
        select: {
            id: true,
            email: true,
            username: true,
            photoUrl: true,
            createdAt: true,
            ratings: {
                select: {
                    bulletRating: true,
                    blitzRating: true,
                    rapidRating: true
                }
            },
            totalGames: true,
            totalWins: true,
            totalLosses: true,
            totalDraws: true,
            totalTimePlayed: true,
        }
    });
};