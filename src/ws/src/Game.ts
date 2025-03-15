import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { START_GAME, GAME_OVER, MOVE } from "./Messages.js"
import redisClient from "../../services/redisClient.js";
import { GameStatus, User } from "@prisma/client";
import prismaClient from "../../services/prismaClient.js";
import { Timer } from "../../models/Timer.js";

type UserWithoutCreds = Pick<User, "username" | "photoUrl">;
export class Game {
    id: string;
    gameDuration: number;
    gameType: string;
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

    constructor(id: string, player1Socket: WebSocket, player2Socket: WebSocket, player1: UserWithoutCreds, player2: UserWithoutCreds, time: number, gameType: string) {
        this.id = id;
        this.gameDuration = time;
        this.gameType = gameType;
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
                    'b',
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
                    'w',
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
            this.board.move(move);
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
                's',
                '~',
                'STALEMATE');
            return;
        }

        if (this.board.isInsufficientMaterial()) {
            await this.declareResult(
                move,
                'i',
                '~',
                'INSUFFICIENT_MATERIAL');
            return;
        }

        //check if the game is over
        if (this.board.isDraw()) {
            await this.declareResult(
                move,
                'd',
                '~',
                'DRAW');
            return;
        }

        if (this.board.isCheckmate()) {
            await this.declareResult(
                move,
                this.board.turn() === 'w' ? 'b' : 'w',
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
        result: string,
        winningUser: string,
        cause: string,
        shouldSaveMoves: boolean = true
    ) {
        this.player1Socket.send(JSON.stringify({
            id: this.id,
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: result,
            cause: cause,
            winningUser: winningUser
        }));
        this.player2Socket.send(JSON.stringify({
            id: this.id,
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: result,
            cause: cause,
            winningUser: winningUser
        }));

        this.activeTimer.clear();

        //Time to store the moves in DB.
        if (shouldSaveMoves) await this.saveMovesToDB();
        await this.addResultData(result, winningUser, cause);
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

    async addResultData(result: string, winningUser: string, termination: string) {
        await prismaClient.game.update({
            where: { id: this.id },
            data: {
                result: result,
                winningUser: winningUser,
                termination: termination
            }
        });
    }
}