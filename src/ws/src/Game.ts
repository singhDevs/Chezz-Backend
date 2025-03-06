import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { START_GAME, GAME_OVER, MOVE } from "./Messages.js"
import redisClient from "../../services/redisClient.js";
import { GameStatus } from "@prisma/client";
import prismaClient from "../../services/prismaClient.js";
import { Timer } from "../../models/Timer.js";

export class Game {
    id: string;
    player1: WebSocket;
    player2: WebSocket;
    player1Username: string;
    player2Username: string;
    private board: Chess;
    private whiteTimer: Timer;
    private blackTimer: Timer;
    private activeTimer: Timer;
    private passiveTimer: Timer;
    drawCount: Set<WebSocket> = new Set();

    constructor(id: string, player1: WebSocket, player2: WebSocket, player1Username: string, player2Username: string, time: number) {
        this.id = id;
        this.board = new Chess();
        this.player1 = player1;
        this.player2 = player2;
        this.player1Username = player1Username;
        this.player2Username = player2Username;
        this.player1.send(JSON.stringify({
            type: START_GAME,
            color: 'w',
            opponent: player2Username
        }));
        this.player2.send(JSON.stringify({
            type: START_GAME,
            color: 'b',
            opponent: player1Username
        }));
        this.whiteTimer = new Timer(time, {
            onTimeUpdate: (time) => {
                // console.log(`Time left: ${Math.floor(time / 1000)} seconds`);
            },
            onTimeout: async () => {
                console.log("White Time's up! White lost!");
                this.player1.send(JSON.stringify({
                    type: GAME_OVER,
                    move: { from: "NA", to: "NA", piece: "NA" },
                    board: JSON.stringify(this.board),
                    result: 'b',
                    cause: 'TIMEOUT'
                }));

                this.player2.send(JSON.stringify({
                    type: GAME_OVER,
                    move: { from: "NA", to: "NA", piece: "NA" },
                    board: JSON.stringify(this.board),
                    result: 'b',
                    cause: 'TIMEOUT'
                }));

                this.activeTimer.clear();

                //Time to store the moves in DB.
                await this.saveMovesToDB();
                return;
            }
        });
        this.blackTimer = new Timer(time, {
            onTimeUpdate: (time) => {
                // console.log(`Time left: ${Math.floor(time / 1000)} seconds`);
            },
            onTimeout: async () => {
                console.log("Black Time's up!, Black lost!");
                this.player1.send(JSON.stringify({
                    type: GAME_OVER,
                    move: { from: "NA", to: "NA", piece: "NA" },
                    board: JSON.stringify(this.board),
                    result: 'w',
                    cause: 'TIMEOUT'
                }));

                this.player2.send(JSON.stringify({
                    type: GAME_OVER,
                    move: { from: "NA", to: "NA", piece: "NA" },
                    board: JSON.stringify(this.board),
                    result: 'w',
                    cause: 'TIMEOUT'
                }));

                this.activeTimer.clear();

                //Time to store the moves in DB.
                await this.saveMovesToDB();
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
        if (this.board.turn() === "w" && socket !== this.player1) {
            return;
        }
        if (this.board.turn() === "b" && socket !== this.player2) {
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
            await this.declareResult(move, 'd', 'STALEMATE');
            return;
        }

        if (this.board.isInsufficientMaterial()) {
            await this.declareResult(move, 'd', 'INSUFFICIENT_MATERIAL');
            return;
        }

        //check if the game is over
        if (this.board.isDraw()) {
            await this.declareResult(move, 'd', 'DRAW');
            return;
        }

        if (this.board.isCheckmate()) {
            await this.declareResult(move, this.board.turn() === 'w' ? 'b' : 'w', 'CHECKMATE');
            return;
        }

        //send the updated board & updated timeLeft for both the players to both the players
        if (this.board.turn() === "w") {
            console.log("White's turn, black moved piece: " + piece);
            this.player1.send(JSON.stringify({
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
            this.player2.send(JSON.stringify({
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
    }, result: string,
        cause: string,
        shouldSaveMoves: boolean = true) {
        this.player1.send(JSON.stringify({
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: result,
            cause: cause
        }));
        this.player2.send(JSON.stringify({
            type: GAME_OVER,
            move: move,
            board: JSON.stringify(this.board),
            result: result,
            cause: cause
        }));

        this.activeTimer.clear();

        //Time to store the moves in DB.
        if (shouldSaveMoves) await this.saveMovesToDB();
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

    async addResultData(result: string, termination: string) {
        await prismaClient.game.update({
            where: { id: this.id },
            data: {
                result: result,
                termination: termination
            }
        });
    }
}