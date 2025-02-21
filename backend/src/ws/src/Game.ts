import {WebSocket} from "ws";
import { Chess } from "chess.js";
import {START_GAME, GAME_OVER, MOVE} from "./Messages"

export class Game {
    player1: WebSocket;
    player2: WebSocket;
    player1Username: string;
    player2Username: string;
    private board: Chess;
    private moves: String[];
    private startTime: Date;

    constructor(player1: WebSocket, player2: WebSocket, player1Username: string, player2Username: string) {
        this.player1 = player1;
        this.player2 = player2;
        this.player1Username = player1Username;
        this.player2Username = player2Username;
        this.board = new Chess();
        this.moves = [];
        this.startTime = new Date();
        this.player1.send(JSON.stringify({
            type: START_GAME,
            color: 'w',
            opponent: player2Username
            
        }))
        this.player2.send(JSON.stringify({
            type: START_GAME,
            color: 'b',
            opponent: player1Username
        }))
    }

    makeMove(socket: WebSocket, move: {
        from: string,
        to: string,
        piece: string
    }) { 
        if(this.board.turn() === "w" && socket !== this.player1) {
            return;
        }
        if(this.board.turn()=== "b" && socket !== this.player2) {
            return;
        }

        try{
            this.board.move(move);
        }
        catch(e){
            console.error(e);
            return;
        }

        //check if the game is over
        if(this.board.isDraw()){
            this.player1.send(JSON.stringify({
                type: GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: 'd'
            }))
            this.player2.send(JSON.stringify({
                type: GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: 'd'
            }))
        }

        if(this.board.isGameOver()){
            this.player1.send(JSON.stringify({
                type: GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: this.board.turn() === 'w' ? 'b' : 'w'
            }))

            this.player2.send(JSON.stringify({
                type: GAME_OVER,
                move: move,
                board: JSON.stringify(this.board),
                result: this.board.turn() === 'w' ? 'b' : 'w'
            }))
            return;
        }

        //send the updated board to both the players
        if(this.board.turn() === "w"){
            this.player1.send(JSON.stringify({
                type: MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }))
            this.player2.send(JSON.stringify({
                type: MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }))
        }
        else{
            this.player1.send(JSON.stringify({
                type: MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }))
            this.player2.send(JSON.stringify({
                type: MOVE,
                move: move,
                board: JSON.stringify(this.board)
            }))
        }
    }
}
