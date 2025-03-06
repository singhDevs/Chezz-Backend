import { Game } from "./Game.js"
import { WebSocket } from "ws"
import {INIT_GAME, MOVE} from "./Messages"

export class GameManager{
    private games: Game[]
    private pendingUser: WebSocket | null = null
    private users: WebSocket[]
    private gameRooms = new Map<string, WebSocket[]>(); // gameId → [player1, player2]

    constructor(){
        this.games = []
        this.users = []
    }

    // addUser(socket: WebSocket, userId: string){
    //     this.users.push(socket)
    //     this.addHandler(socket)
    // };

    removeuser(socket: WebSocket){
        this.users = this.users.filter(user => user !== socket)
    };

    // private addHandler(socket: WebSocket){
    //     socket.on("message", (data) => {
    //         const message = JSON.parse(data.toString())
    //         console.log("message as received: ", message)
    //         if(message.type === INIT_GAME){
    //             if(this.pendingUser){
    //                 //Both players have joined, create & start the game
    //                 const game = new Game(this.pendingUser, socket)
    //                 this.games.push(game)
    //                 this.pendingUser = null
    //             }
    //             else{
    //                 this.pendingUser = socket
    //             }
    //         }

    //         if(message.type === MOVE){
    //             console.log(message)
    //             const game = this.games.find(game => game.player1 === socket || game.player2 === socket)
    //             if(game) {
    //                 game.makeMove(socket, message.move)
    //             }
    //         }
    //     })
    // }
}