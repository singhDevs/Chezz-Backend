import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { START_GAME, GAME_OVER, MOVE } from "./Messages.js"
import redisClient from "../../services/redisClient.js";
import { GameMode, GameStatus, Rating, ResultType as PrismaResultType } from "@prisma/client";
import prismaClient from "../../services/prismaClient.js";
import { Timer } from "../../models/Timer.js";
import { GameType } from '@prisma/client';
import { updateRatings, ResultType as GlickoResultType } from "glicko2-ts";

type UserWithoutCreds = {
    id: string;
    username: string;
    photoUrl: string | null;
    ratings?: Rating | null;
};

export class Game {
    id: string;
    gameDuration: number;
    gameType: GameType;
    gameMode: GameMode;
    player1Socket: WebSocket;
    player2Socket: WebSocket;
    player1: UserWithoutCreds;
    player2: UserWithoutCreds;
    private board: Chess;
    private whiteTimer: Timer;
    private blackTimer: Timer;
    private activeTimer: Timer;
    private passiveTimer: Timer;
    drawCount: Set<WebSocket> = new Set();

    constructor(id: string, player1Socket: WebSocket, player2Socket: WebSocket, player1: UserWithoutCreds, player2: UserWithoutCreds, time: number, gameMode: GameMode, gameType: GameType) {
        this.id = id;
        this.gameDuration = time;
        this.gameType = gameType;
        this.gameMode = gameMode;
        this.board = new Chess();
        this.player1Socket = player1Socket;
        this.player2Socket = player2Socket;
        this.player1 = player1;
        this.player2 = player2;
        this.player1Socket.send(JSON.stringify({
            type: START_GAME,
            color: 'w',
            opponent: player2,
            duration: time,
            gameType: gameType
        }));
        this.player2Socket.send(JSON.stringify({
            type: START_GAME,
            color: 'b',
            opponent: player1,
            duration: time,
            gameType: gameType
        }));
        this.whiteTimer = new Timer(time, {
            onTimeUpdate: (time) => {
                // console.log(`Time left: ${Math.floor(time / 1000)} seconds`);
            },
            onTimeout: async () => {
                console.log("White Time's up! White lost!");
                this.declareResult(
                    { from: "NA", to: "NA" },
                    GlickoResultType.BLACK,
                    player2.username,
                    'TIMEOUT');
                return;
            }
        });
        this.blackTimer = new Timer(time, {
            onTimeUpdate: (time) => {
                // console.log(`Time left: ${Math.floor(time / 1000)} seconds`);
            },
            onTimeout: async () => {
                console.log("Black Time's up!, Black lost!");
                this.declareResult(
                    { from: "NA", to: "NA" },
                    GlickoResultType.WHITE,
                    player1.username,
                    'TIMEOUT');
                return;
            }
        });
        this.whiteTimer.start();
        this.activeTimer = this.whiteTimer;
        this.passiveTimer = this.blackTimer;
    }

    timerHandler() {
        this.activeTimer.pause();
        this.passiveTimer.start();
        [this.activeTimer, this.passiveTimer] = [this.passiveTimer, this.activeTimer];
    }

    async makeMove(socket: WebSocket, move: {
        from: string,
        to: string,
        piece: string,
        promotion: string | null,
        queenSideCastle: Boolean,
        kingSideCastle: Boolean
    }, piece: string) {
        if (this.board.turn() === "w" && socket !== this.player1Socket) {
            return;
        }
        if (this.board.turn() === "b" && socket !== this.player2Socket) {
            return;
        }

        try {
            move.piece = piece;
            if (move.promotion != null) {
                console.log("Move with promotion: " + move.promotion + " received");
                this.board.move({ from: move.from, to: move.to, promotion: move.promotion });
                console.log("Promotion: " + move.promotion + " done!");
            }
            else {
                console.log("Move with promotion: [null] received");
                this.board.move({ from: move.from, to: move.to });
            }
            this.timerHandler();


            //Move is valid, can now cache it.
            let moveString = '';
            if (move.queenSideCastle)
                moveString = 'O-O-O';
            else if (move.kingSideCastle)
                moveString = 'O-O';
            else
                moveString = `${piece}${move.from}${move.to}`;
            console.log(`Move: ${moveString} to REDIS`);
            redisClient.LPUSH(`game:${this.id}`, moveString);
        }
        catch (e) {
            console.error(e);
            return;
        }

        if (this.board.isStalemate()) {
            await this.declareResult(
                move,
                GlickoResultType.DRAW,
                '~',
                'STALEMATE');
            return;
        }

        if (this.board.isInsufficientMaterial()) {
            await this.declareResult(
                move,
                GlickoResultType.DRAW,
                '~',
                'INSUFFICIENT_MATERIAL');
            return;
        }

        //check if the game is over
        if (this.board.isDraw()) {
            await this.declareResult(
                move,
                GlickoResultType.DRAW,
                '~',
                'DRAW');
            return;
        }

        if (this.board.isCheckmate()) {
            await this.declareResult(
                move,
                this.board.turn() === 'w' ? GlickoResultType.BLACK : GlickoResultType.WHITE,
                this.board.turn() === 'w' ? this.player2.username : this.player1.username,
                'CHECKMATE');
            return;
        }

        //send the updated board & updated timeLeft for both the players to both the players
        if (this.board.turn() === "w") {
            console.log("White's turn, black moved piece: " + piece);
            this.player1Socket.send(JSON.stringify({
                type: MOVE,
                move: move,
                piece: piece,
                board: JSON.stringify(this.board),
                turn: 'w',
                whiteTime: this.whiteTimer.timeLeft,
                blackTime: this.blackTimer.timeLeft
            }))
        }
        else {
            console.log("Black's turn, black moved piece: " + piece);
            this.player2Socket.send(JSON.stringify({
                type: MOVE,
                move: move,
                piece: piece,
                board: JSON.stringify(this.board),
                turn: 'b',
                whiteTime: this.whiteTimer.timeLeft,
                blackTime: this.blackTimer.timeLeft
            }))
        }
    }

    async declareResult(move: {
        from: string,
        to: string
    },
        result: GlickoResultType,
        winningUser: string,
        cause: string,
        shouldSaveMoves: boolean = true
    ) {
        this.activeTimer.clear();
        let updatedRatings = null;
        if (this.gameMode === GameMode.RATED) {
            updatedRatings = await this.updateRatingdata(result);
            if (updatedRatings === undefined || updatedRatings === null) {
                console.log("Error in receiving updating ratings, skipping returning updated Users.");
            }
            else {
                // Updating user data
                await this.updateUserData(this.player1, 'w', updatedRatings.player1Rating, result, winningUser);
                await this.updateUserData(this.player2, 'b', updatedRatings.player2Rating, result, winningUser);
            }
        }

        //Time to store the moves in DB.
        if (shouldSaveMoves) await this.saveMovesToDB();
        await this.addResultData(result, winningUser, cause);

        this.player1Socket.send(JSON.stringify({
            id: this.id,
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: this.mapResult(result),
            cause: cause,
            winningUser: winningUser,
            updatedRatings: updatedRatings?.player1Rating
        }));
        this.player2Socket.send(JSON.stringify({
            id: this.id,
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: this.mapResult(result),
            cause: cause,
            winningUser: winningUser,
            updatedRatings: updatedRatings?.player2Rating
        }));
    }

    async updateUserData(player: UserWithoutCreds, playerColor: string, playerRating: { bulletRating: number; blitzRating: number; rapidRating: number; }, result: GlickoResultType, winningUser: string) {
        await prismaClient.user.update({
            where: { id: player.id },
            data: {
                totalGames: { increment: 1 },
                totalWins: { increment: (result === GlickoResultType.WHITE && playerColor === 'w') ? 1 : (result === GlickoResultType.BLACK && playerColor === 'b') ? 1 : 0 },
                totalLosses: { increment: (result === GlickoResultType.WHITE && playerColor === 'b') ? 1 : (result === GlickoResultType.BLACK && playerColor === 'w') ? 1 : 0 },
                totalDraws: { increment: result === GlickoResultType.DRAW ? 1 : 0 },
                totalTimePlayed: { increment: Math.abs(this.gameDuration - (this.activeTimer.timeLeft / 1000)) / 60 } //in minutes
            }
        });
    }

    async saveMovesToDB() {
        console.log("Saving moves to DB...");
        try {
            const moves = await redisClient.LRANGE(`game:${this.id}`, 0, -1)
            moves.reverse();

            let moveString = "";
            for (let i = 0; i < moves.length; i++) {
                if (i == moves.length - 1) {
                    moveString += moves[i];
                } else {
                    moveString += moves[i] + " ";
                }
            }

            const game = await prismaClient.game.update({
                where: { id: this.id },
                data: {
                    moves: moveString,
                    status: GameStatus.COMPLETED
                }
            });

            // const movesData = this.moves.map(move => ({
            //     gameId: this.id,
            //     notation: this.convertToSAN(move),
            // }));
            // console.log("Moves to save: ", movesData);

            // const x = await prismaClient.move.create({
            //     data: {
            //         gameId: this.id,
            //         notation: ""
            //     }
            // });

            // const [game] = await this.prisma.$transaction([
            //     this.prisma.game.update({
            //         where: { id: this.id },
            //         data: {
            //             moves: x,
            //             status: GameStatus.COMPLETED
            //         }
            //     }),
            // ]);

            console.log("Moves saved to DB");
            console.log("Game: " + game.moves);
        } catch (error) {
            console.error(`Error while saving to DB: ${error}`);
        }
    }

    async updateRatingdata(result: GlickoResultType) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;

        if (this.gameType === GameType.BULLET) {
            if (this.player1.ratings!.lastBulletGameDate === null || this.player1.ratings!.lastBulletGameDate === undefined) {
                this.player1.ratings!.lastBulletGameDate = new Date(formattedDate);
            }
            if (this.player2.ratings!.lastBulletGameDate === null || this.player2.ratings!.lastBulletGameDate === undefined) {
                this.player2.ratings!.lastBulletGameDate = new Date(formattedDate);
            }

            const player1Rating = { rating: this.player1.ratings!.bulletRating, rd: this.player1.ratings!.bulletRD, volatility: this.player1.ratings!.bulletVolatility, lastGameTime: this.player1.ratings!.lastBulletGameDate };
            const player2Rating = { rating: this.player2.ratings!.bulletRating, rd: this.player2.ratings!.bulletRD, volatility: this.player2.ratings!.bulletVolatility, lastGameTime: this.player2.ratings!.lastBulletGameDate };

            const newRatings = await updateRatings(player1Rating, player2Rating, result, new Date());
            newRatings.newRatingWhite.rating = Math.ceil(newRatings.newRatingWhite.rating);
            newRatings.newRatingBlack.rating = Math.ceil(newRatings.newRatingBlack.rating);


            //Modifying the history array
            const rating1 = await prismaClient.rating.findUnique({ where: { userId: this.player1.id } });
            const rating2 = await prismaClient.rating.findUnique({ where: { userId: this.player2.id } });
            let history1 = [];
            let history2 = [];
            const gameTypeLower = this.gameType.toLowerCase();
            const gameTypeCapitalized = this.gameType.charAt(0).toUpperCase() + this.gameType.slice(1).toLowerCase();
            const historyField = `${gameTypeLower}RatingHistory`;
            const lastGameDateField = `last${gameTypeCapitalized}GameDate`;
            const newEntry1 = { rating: newRatings.newRatingWhite.rating, createdAt: new Date().toISOString() };
            const newEntry2 = { rating: newRatings.newRatingBlack.rating, createdAt: new Date().toISOString() };
            history1 = rating1 ? rating1.bulletRatingHistory : [];
            history1 = [...history1, newEntry1];
            history2 = rating2 ? rating2.bulletRatingHistory : [];
            history2 = [...history2, newEntry2];

            if (history1.length > 10) history1 = history1.slice(-10);
            if (history2.length > 10) history2 = history2.slice(-10);


            await this.saveNewRatings(
                {
                    [historyField]: history1,
                    bulletRating: newRatings.newRatingWhite.rating,
                    bulletRD: newRatings.newRatingWhite.rd,
                    bulletVolatility: newRatings.newRatingWhite.volatility,
                    lastBulletGameDate: this.player1.ratings!.lastBulletGameDate,
                },
                {
                    [historyField]: history2,
                    bulletRating: newRatings.newRatingBlack.rating,
                    bulletRD: newRatings.newRatingBlack.rd,
                    bulletVolatility: newRatings.newRatingBlack.volatility,
                    lastBulletGameDate: this.player2.ratings!.lastBulletGameDate,
                }
            );
            return {
                player1Rating: {
                    bulletRating: newRatings.newRatingWhite.rating,
                    blitzRating: this.player1.ratings!.blitzRating,
                    rapidRating: this.player1.ratings!.rapidRating,
                },
                player2Rating: {
                    bulletRating: newRatings.newRatingBlack.rating,
                    blitzRating: this.player2.ratings!.blitzRating,
                    rapidRating: this.player2.ratings!.rapidRating,
                }
            };
        }
        else if (this.gameType === GameType.BLITZ) {
            if (this.player1.ratings!.lastBlitzGameDate === null || this.player1.ratings!.lastBlitzGameDate === undefined) {
                this.player1.ratings!.lastBlitzGameDate = new Date(formattedDate);
            }
            if (this.player2.ratings!.lastBlitzGameDate === null || this.player2.ratings!.lastBlitzGameDate === undefined) {
                this.player2.ratings!.lastBlitzGameDate = new Date(formattedDate);
            }

            const player1Rating = { rating: this.player1.ratings!.blitzRating, rd: this.player1.ratings!.blitzRD, volatility: this.player1.ratings!.blitzVolatility, lastGameTime: this.player1.ratings!.lastBlitzGameDate };
            const player2Rating = { rating: this.player2.ratings!.blitzRating, rd: this.player2.ratings!.blitzRD, volatility: this.player2.ratings!.blitzVolatility, lastGameTime: this.player2.ratings!.lastBlitzGameDate };

            const newRatings = await updateRatings(player1Rating, player2Rating, result, new Date());
            newRatings.newRatingWhite.rating = Math.ceil(newRatings.newRatingWhite.rating);
            newRatings.newRatingBlack.rating = Math.ceil(newRatings.newRatingBlack.rating);

            //Modifying the history array
            const rating1 = await prismaClient.rating.findUnique({ where: { userId: this.player1.id } });
            const rating2 = await prismaClient.rating.findUnique({ where: { userId: this.player2.id } });
            let history1 = [];
            let history2 = [];
            const gameTypeLower = this.gameType.toLowerCase();
            const gameTypeCapitalized = this.gameType.charAt(0).toUpperCase() + this.gameType.slice(1).toLowerCase();
            const historyField = `${gameTypeLower}RatingHistory`;
            const lastGameDateField = `last${gameTypeCapitalized}GameDate`;
            const newEntry1 = { rating: newRatings.newRatingWhite.rating, createdAt: new Date().toISOString() };
            const newEntry2 = { rating: newRatings.newRatingBlack.rating, createdAt: new Date().toISOString() };
            history1 = rating1 ? rating1.blitzRatingHistory : [];
            history1 = [...history1, newEntry1];
            history2 = rating2 ? rating2.blitzRatingHistory : [];
            history2 = [...history2, newEntry2];

            if (history1.length > 10) history1 = history1.slice(-10);
            if (history2.length > 10) history2 = history2.slice(-10);

            await this.saveNewRatings(
                {
                    [historyField]: history1,
                    blitzRating: newRatings.newRatingWhite.rating,
                    blitzRD: newRatings.newRatingWhite.rd,
                    blitzVolatility: newRatings.newRatingWhite.volatility,
                    lastBlitzGameDate: this.player1.ratings!.lastBlitzGameDate,
                },
                {
                    [historyField]: history2,
                    blitzRating: newRatings.newRatingBlack.rating,
                    blitzRD: newRatings.newRatingBlack.rd,
                    blitzVolatility: newRatings.newRatingBlack.volatility,
                    lastBlitzGameDate: this.player2.ratings!.lastBlitzGameDate,
                }
            );
            return {
                player1Rating: {
                    bulletRating: this.player1.ratings!.bulletRating,
                    blitzRating: newRatings.newRatingWhite.rating,
                    rapidRating: this.player1.ratings!.rapidRating,
                },
                player2Rating: {
                    bulletRating: this.player2.ratings!.bulletRating,
                    blitzRating: newRatings.newRatingBlack.rating,
                    rapidRating: this.player2.ratings!.rapidRating,
                }
            };
        }
        else {
            if (this.player1.ratings!.lastRapidGameDate === null || this.player1.ratings!.lastRapidGameDate === undefined) {
                this.player1.ratings!.lastRapidGameDate = new Date(formattedDate);
            }
            if (this.player2.ratings!.lastRapidGameDate === null || this.player2.ratings!.lastRapidGameDate === undefined) {
                this.player2.ratings!.lastRapidGameDate = new Date(formattedDate);
            }

            const player1Rating = { rating: this.player1.ratings!.rapidRating, rd: this.player1.ratings!.rapidRD, volatility: this.player1.ratings!.rapidVolatility, lastGameTime: this.player1.ratings!.lastRapidGameDate };
            const player2Rating = { rating: this.player2.ratings!.rapidRating, rd: this.player2.ratings!.rapidRD, volatility: this.player2.ratings!.rapidVolatility, lastGameTime: this.player2.ratings!.lastRapidGameDate };

            const newRatings = await updateRatings(player1Rating, player2Rating, result, new Date());
            newRatings.newRatingWhite.rating = Math.ceil(newRatings.newRatingWhite.rating);
            newRatings.newRatingBlack.rating = Math.ceil(newRatings.newRatingBlack.rating);

            //Modifying the history array
            const rating1 = await prismaClient.rating.findUnique({ where: { userId: this.player1.id } });
            const rating2 = await prismaClient.rating.findUnique({ where: { userId: this.player2.id } });
            let history1 = [];
            let history2 = [];
            const gameTypeLower = this.gameType.toLowerCase();
            const gameTypeCapitalized = this.gameType.charAt(0).toUpperCase() + this.gameType.slice(1).toLowerCase();
            const historyField = `${gameTypeLower}RatingHistory`;
            const lastGameDateField = `last${gameTypeCapitalized}GameDate`;
            const newEntry1 = { rating: newRatings.newRatingWhite.rating, createdAt: new Date().toISOString() };
            const newEntry2 = { rating: newRatings.newRatingBlack.rating, createdAt: new Date().toISOString() };
            history1 = rating1 ? rating1.rapidRatingHistory : [];
            history1 = [...history1, newEntry1];
            history2 = rating2 ? rating2.rapidRatingHistory : [];
            history2 = [...history2, newEntry2];

            if (history1.length > 10) history1 = history1.slice(-10);
            if (history2.length > 10) history2 = history2.slice(-10);

            await this.saveNewRatings(
                {
                    [historyField]: history1,
                    rapidRating: newRatings.newRatingWhite.rating,
                    rapidRD: newRatings.newRatingWhite.rd,
                    rapidVolatility: newRatings.newRatingWhite.volatility,
                    lastRapidGameDate: this.player1.ratings!.lastRapidGameDate,
                },
                {
                    [historyField]: history2,
                    rapidRating: newRatings.newRatingBlack.rating,
                    rapidRD: newRatings.newRatingBlack.rd,
                    rapidVolatility: newRatings.newRatingBlack.volatility,
                    lastRapidGameDate: this.player2.ratings!.lastRapidGameDate,
                }
            );
            return {
                player1Rating: {
                    bulletRating: this.player1.ratings!.bulletRating,
                    blitzRating: this.player1.ratings!.blitzRating,
                    rapidRating: newRatings.newRatingWhite.rating,
                },
                player2Rating: {
                    bulletRating: this.player2.ratings!.bulletRating,
                    blitzRating: this.player2.ratings!.blitzRating,
                    rapidRating: newRatings.newRatingBlack.rating,
                }
            };
        }
    }

    async saveNewRatings(player1RatingData: any, player2RatingData: any) {
        await prismaClient.rating.update({
            where: {
                userId: this.player1.ratings!.userId
            },
            data: player1RatingData
        });
        await prismaClient.rating.update({
            where: {
                userId: this.player2.ratings!.userId
            },
            data: player2RatingData
        });
    }

    async addResultData(result: GlickoResultType, winningUser: string, termination: string) {
        await prismaClient.game.update({
            where: { id: this.id },
            data: {
                result: this.mapResult(result),
                winningUser: winningUser,
                termination: termination
            }
        });
    }

    mapResult(result: GlickoResultType): PrismaResultType {
        switch (result) {
            case GlickoResultType.WHITE:
                return PrismaResultType.WHITE;
            case GlickoResultType.BLACK:
                return PrismaResultType.BLACK;
            case GlickoResultType.DRAW:
                return PrismaResultType.DRAW;
            default:
                throw new Error("Invalid result type");
        }
    }
}