import { WebSocket } from "ws";
import { Game } from "./ws/src/Game.js";
import { GameMode, GameType } from "@prisma/client";

interface PendingGame {
    gameId: string;
    userId: string;
    ws?: WebSocket;
}

const state = {
    onlineUsers: [] as WebSocket[]
};

const pendingGames: Map<GameMode, Map<GameType, Map<number, PendingGame[]>>> = new Map();
for (const mode of Object.values(GameMode)) {
    const gameTypeMap: Map<GameType, Map<number, PendingGame[]>> = new Map();
    for (const type of Object.values(GameType)) {
        gameTypeMap.set(type, new Map<number, PendingGame[]>());
    }
    pendingGames.set(mode, gameTypeMap);
}
const games: Game[] = [];
export {
    pendingGames,
    games,
    state,
    PendingGame
};


// const pendingBulletGames: Map<number, PendingGame[]> = new Map();     // [gameId, userId, ws]
// const pendingBlitzGames: Map<number, PendingGame[]> = new Map();     // [gameId, userId, ws]
// const pendingRapidGames: Map<number, PendingGame[]> = new Map();     // [gameId, userId, ws]