import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

export const registerUser = async (email: string, password: string, username: string) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    return await prisma.user.create({
        data: {
            email: email,
            password: hashedPassword,
            username: username,
            authMethod: "EMAIL"
        },
    })
}
export const loginUser = async (email: string, password: string) => {
    if (JWT_SECRET === undefined) {
        throw new Error('JWT_SECRET is not defined!');
    }

    const user = await prisma.user.findUnique({
        where: {
            email_authMethod: {
                email: email,
                authMethod: "EMAIL"
            }
        }
    });

    if (user?.password === null)
        throw new Error('User password is not defined!');
    if (!user)
        throw new Error('User does not exist!');
    if(!await bcrypt.compare(password, user.password)){
        throw new Error('Invalid credentials!');
    }

    return user;
}

export const generateToken = (
    userId: string,
    JWT_SECRET: Secret,
    duration: number = 60 * 60 * 24 // Default 24 hours
): string => {
    const options: SignOptions = {
        expiresIn: duration,
        algorithm: 'HS256'
    };

    return jwt.sign(
        { userId: userId },
        JWT_SECRET,
        options
    );
};