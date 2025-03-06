import dotenv from 'dotenv';
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import prismaClient from "../services/prismaClient.js";
import { state, pendingGames } from "../gameStore.js";

dotenv.config();

const joinGame = async (req: Request, res: Response) => {
    console.log("Joining game request received");
    try {
        const userId = req.user.id;
        const token = req.headers['x-validation-token'] as string;

        if (!userId) {
            res.status(400).json({ error: "Missing user ID" });
            return;
        }
        if (!token) {
            res.status(400).json({ error: "Missing token" });
            return;
        }

        const game: [string, number] = await createOrJoinGame(userId);

        res.status(200)
            .json({
                gameId: game[0],
                wsURL: `ws://10.0.2.2:3000/game/ws?gameId=${game[0]}`
            });
    } catch (error) {
        res.status(500).send(error);
    }
};

async function createOrJoinGame(userId: string): Promise<[string, number]> {
    if (pendingGames.length > 0) {
        const game = pendingGames[pendingGames.length - 1];
        await addPlayerToExistingGame(userId, game[0]);
        return [game[0], 0];    //returning the gameID, 0 for New Game, 1 for Joining existing game
    }
    else {
        const gameId = await createNewGame(userId);
        pendingGames.push([gameId, userId]);
        return [gameId, 1];     //returning the gameID, 0 for New Game, 1 for Joining existing game
    }
}

async function createNewGame(userId: string) {
    const user = await prismaClient.user.findUnique({ where: { id: userId } });
    if (user == null) {
        throw new Error("User not found!");
    }

    const createData: Prisma.GameCreateInput = {
        whitePlayer: {
            connect: { id: userId }
        },
        blackPlayer: undefined
    };
    const newGame = await prismaClient.game.create({ data: createData });

    return newGame.id;
}

async function addPlayerToExistingGame(userId: string, gameId: string) {
    await prismaClient.game.update({
        where: {
            id: gameId
        },
        data: {
            blackPlayer: {
                connect: { id: userId }
            }
        }
    })
}

export {
    joinGame
};