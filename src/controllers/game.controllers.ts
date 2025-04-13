import dotenv from 'dotenv';
import { Game, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import prismaClient from "../services/prismaClient.js";
import { GameType, GameMode } from '@prisma/client';
import { state, pendingGames, PendingGame } from "../gameStore.js";

dotenv.config();

const joinGame = async (req: Request, res: Response) => {
    console.log("Joining game request received");
    try {
        const userId = req.user.id;
        const gameType = req.body.gameType as GameType;
        const gameMode = req.body.gameMode as GameMode;
        const token = req.headers['x-validation-token'] as string;
        const duration = req.body.duration;
        console.log("Duration: ", duration);

        if (!userId) {
            res.status(400).json({ error: "Missing user ID" });
            return;
        }
        if (!token) {
            res.status(400).json({ error: "Missing token" });
            return;
        }

        const game: [string, number] = await createOrJoinGame(userId, duration, gameMode, gameType);

        res.status(200)
            .json({
                gameId: game[0],
                wsURL: `ws://10.0.2.2:3000/game/ws?gameId=${game[0]}`
            });
    } catch (error) {
        console.log("Error in game.contollers: ", error);
        res.status(500).send(error);
    }
};

async function createOrJoinGame(userId: string, duration: number, gameMode: GameMode, gameType: GameType): Promise<[string, number]> {
    console.log("Creating or Joining game...");
    const pendingGamesMap = pendingGames.get(gameMode)!.get(gameType);

    if (pendingGamesMap === undefined) {
        console.log("Pending games map is undefined!");
        throw new Error("Pending games map is undefined!");
    }

    if (pendingGamesMap!.get(duration)?.length !== undefined && pendingGamesMap!.get(duration)?.length! > 0) {
        const length = pendingGamesMap!.get(duration)?.length! - 1;
        const game = pendingGamesMap!.get(duration)?.at(length);
        await addPlayerToExistingGame(userId, game!.gameId);

        return [game!.gameId, 0];    //returning the gameID, 0 for New Game, 1 for Joining existing game
    }
    else {
        console.log("Duration for which new game is created: ", duration);
        const gameId = await createNewGame(userId, duration);
        const newGame: PendingGame = {
            gameId: gameId,
            userId: userId
        }
        if (pendingGamesMap!.get(duration) === undefined) {
            pendingGamesMap!.set(duration, []);
            pendingGamesMap!.get(duration)!.push(newGame);
            console.log("duration is undefined, created new array and pushed the game");
            console.log(pendingGamesMap!.get(duration));
        }
        else {
            pendingGamesMap!.get(duration)!.push(newGame);
            console.log("duration is defined, pushed the game");
        }
        return [gameId, 1];     //returning the gameID, 0 for New Game, 1 for Joining existing game
    }
}

async function createOrGetRatings(userId: string) {
    let rating = await prismaClient.rating.findUnique({
        where: {
            userId: userId
        }
    });

    if (!rating) {
        rating = await prismaClient.rating.create({
            data: {
                user: {
                    connect: { id: userId }
                }
            }
        });
    }
    return rating;
}

async function createNewGame(userId: string, duration: number) {
    const user = await prismaClient.user.findUnique({ where: { id: userId } });
    if (user == null) {
        throw new Error("User not found!");
    }

    const createData: Prisma.GameCreateInput = {
        whitePlayer: {
            connect: { id: userId }
        },
        blackPlayer: undefined,
        gameDuration: duration
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

async function deleteGameIfRequired(gameId: string) {
    const game = await prismaClient.game.findUnique({
        where: {
            id: gameId
        }
    });
    if (game) {
        if (game.whitePlayerId === null || game.blackPlayerId === null) {
            await prismaClient.game.delete({
                where: {
                    id: gameId
                }
            });
            console.log("Game deleted successfully!");
        }
    }
}

async function getGames(req: Request, res: Response) {
    try {
        const userId = req.user.id;
        const games = await prismaClient.game.findMany({
            where: {
                OR: [
                    { whitePlayerId: userId },
                    { blackPlayerId: userId }
                ]
            },
            include: {
                whitePlayer: {
                    select: {
                        username: true,
                        photoUrl: true
                    }
                },
                blackPlayer: {
                    select: {
                        username: true,
                        photoUrl: true
                    }
                }
            }
        });
        const ratingHistory = await prismaClient.rating.findUnique({
            where: {
                userId: userId
            },
            select: {
                bulletRatingHistory: true,
                blitzRatingHistory: true,
                rapidRatingHistory: true
            }
        });

        games.sort((gameA, gameB) => gameB.createdAt.getTime() - gameA.createdAt.getTime());

        console.log("Ratings history", ratingHistory);

        console.log("Games: ", games);
        if (games) res.status(200).json(
            { 
                games: games, 
                blitzRatingHistory: ratingHistory?.blitzRatingHistory, 
                bulletRatingHistory: ratingHistory?.bulletRatingHistory, 
                rapidRatingHistory: ratingHistory?.rapidRatingHistory 
            }
        );
        else res.status(404).json({ error: "No games found" });
    } catch (error) {
        console.log("Error in game.contollers: ", error);
        res.status(500).send(error);
    }
}

async function getPGN(req: Request, res: Response): Promise<void> {
    console.log("Fetching PGN...");
    const gameId = req.query.gameId as string;
    if (!gameId) {
        res.status(400).json({ error: "Missing gameId query!" });
        return;
    }

    try {
        const game = await prismaClient.game.findUnique({
            where: {
                id: gameId
            },
            include: {
                whitePlayer: true,
                blackPlayer: true
            }
        });
        if (!game) {
            res.status(404).json({ error: "Game  not found with the given gameId!" });
            return;
        }

        console.log("Game result before PGN gen: ", game.result);

        let result = "";
        if (game.result === 'WHITE') result = "1-0"
        else if (game.result === 'BLACK') result = "0-1"
        else result = "1/2-1/2";

        let pgn = "";
        pgn += `[Event "${game.whitePlayer?.username} vs ${game.blackPlayer?.username}"]\n`
        pgn += `[Site "Chezz"]\n`;
        pgn += `[Date "${game.createdAt.toLocaleDateString()}"]\n`;
        pgn += `[GameMode "${game.gameMode}"]\n`;
        pgn += `[GameType "${game.gameType}"]\n`;
        pgn += `[White "${game.whitePlayer?.username}"]\n`;
        pgn += `[Black "${game.blackPlayer?.username}"]\n`;
        pgn += `[Result "${result}"]\n`;
        pgn += `[TimeControl "${(game.gameDuration)! / 1000}"]\n`;
        pgn += `[Termination "${game.termination}"]\n\n`;

        game.moves?.split(" ").forEach((move, index) => {
            if ((index + 1) % 2 === 0) {
                pgn += ` ${move} `
            }
            else {
                pgn += `${index / 2 + 1}. ${move} `
            }
        });
        pgn += `${result}`;

        console.log(`PGN:\n` + pgn);
        res.status(200).json({ pgn: pgn });
    }
    catch (error) {
        console.log("Error in game.contollers: ", error);
        res.status(500).json({ error: `Error while fetching PGN: ${error}` });
    }
}

export {
    joinGame,
    getGames,
    deleteGameIfRequired,
    getPGN,
    createOrGetRatings
};