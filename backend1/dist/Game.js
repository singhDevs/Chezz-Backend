"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const chess_js_1 = require("chess.js");
const Messages_1 = require("./Messages");
class Game {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;
        this.board = new chess_js_1.Chess();
        this.moves = [];
        this.startTime = new Date();
        this.player1.send(JSON.stringify({
            type: Messages_1.INIT_GAME,
            color: "w"
        }));
        this.player2.send(JSON.stringify({
            type: Messages_1.INIT_GAME,
            color: "b"
        }));
    }
    makeMove(socket, move) {
        if (this.board.turn() === "w" && socket !== this.player1) {
            return;
        }
        if (this.board.turn() === "b" && socket !== this.player2) {
            return;
        }
        try {
            this.board.move(move);
        }
        catch (e) {
            console.error(e);
            return;
        }
        //check if the game is over
        if (this.board.isDraw()) {
            this.player1.send(JSON.stringify({
                type: Messages_1.GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: 'd'
            }));
            this.player2.send(JSON.stringify({
                type: Messages_1.GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: 'd'
            }));
        }
        if (this.board.isGameOver()) {
            this.player1.send(JSON.stringify({
                type: Messages_1.GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: this.board.turn() === 'w' ? 'b' : 'w'
            }));
            this.player2.send(JSON.stringify({
                type: Messages_1.GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: this.board.turn() === 'w' ? 'b' : 'w'
            }));
            return;
        }
        //send the updated board to both the players
        if (this.board.turn() === "w") {
            this.player1.send(JSON.stringify({
                type: Messages_1.MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }));
            this.player2.send(JSON.stringify({
                type: Messages_1.MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }));
        }
        else {
            this.player1.send(JSON.stringify({
                type: Messages_1.MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }));
            this.player2.send(JSON.stringify({
                type: Messages_1.MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }));
        }
    }
}
exports.Game = Game;
