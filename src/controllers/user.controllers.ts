import prismaClient from "../services/prismaClient.js";
import { Request, Response } from "express";


const getProfile = async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    console.log(`User ID: ${userId}`);
    if (!userId) {
        res.status(400).json({
            message: "User ID is missing!"
        });
        return;
    };

    const user = await prismaClient.user.findUnique({
        where: {
            id: userId
        },
        include: {
            ratings: true
        },
        omit: {
            password: true,
            email: true,
            authMethod: true,
            googleId: true,
        }
    });

    if (!user) {
        res.status(404).json({
            message: "User not found!"
        });
        return;
    };

    res.status(200).json({
        message: "User profile",
        user: user
    });
};

export {
    getProfile
};