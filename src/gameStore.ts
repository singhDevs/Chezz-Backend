import { WebSocket } from "ws";
import { Game } from "./ws/src/Game.js";

interface PendingGame {
    gameId: string;
    userId: string;
    ws?: WebSocket;
}

const state = {
    onlineUsers: [] as WebSocket[]
};
const pendingGames: Map<number, PendingGame[]> = new Map();     // [gameId, userId, ws]
const games: Game[] = [];
export {
    pendingGames,
    games,
    state,
    PendingGame
};