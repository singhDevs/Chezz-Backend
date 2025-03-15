import { PrismaClient } from "@prisma/client";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import dotenv from 'dotenv';

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
        omit: {
            password: true,
            authMethod: true,
            googleId: true,
            createdAt: true,
            updatedAt: true,
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

    return await prisma.user.create({
        data: {
            email: payload.email,
            googleId: payload.sub,
            username: username,
            authMethod: 'GOOGLE',
            photoUrl: payload.picture
        },
        omit: {
            password: true,
            authMethod: true,
            googleId: true,
            createdAt: true,
            updatedAt: true,
        }
    })
};