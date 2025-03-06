import { WebSocket } from "ws";
import { Game } from "./ws/src/Game.js";

const state = {
    onlineUsers: [] as WebSocket[]
};
const pendingGames: [string, string, WebSocket?][] = [];     // [gameId, userId, ws]
const games: Game[] = [];
export {
    pendingGames,
    games,
    state
};