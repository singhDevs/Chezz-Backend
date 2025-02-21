import { WebSocket, WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import { pendingGames, games } from '../../gameStore';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Game } from './Game';
import { MOVE } from './Messages';
dotenv.config();

const wss = new WebSocketServer({ port: 8080 });
const JWT_SECRET = process.env.JWT_SECRET;
const gameManager = new GameManager();

wss.on('connection', function connection(ws, req) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    const urlParams = new URLSearchParams(req.url!.split('?')[1]);
    const gameId = urlParams.get('gameId');
    const token = urlParams.get('token');

    try {
        if (token === undefined) {
            throw new Error('Token is missing!');
        }
        if (token === null) {
            throw new Error('Token is null!');
        }
        if (JWT_SECRET === undefined) {
            throw new Error('JWT_SECRET is not defined!');
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        console.log(`${decoded.userId} has joined!`);

        const userId = decoded.userId;

        const game = pendingGames.find(game => game[0] === gameId)
        if (game === undefined) {
            throw new Error('Game not found!');
        }

        if (userId == game[1]) {
            const foundGame = pendingGames.find(game => game[0] === gameId);
            if (foundGame && userId == foundGame[1]) {
                foundGame[2] = ws;
            }
        }
        else {
            pendingGames.splice(pendingGames.indexOf(game), 1);
            games.push(new Game(game[2]!, ws, game[1], userId)); // Start Game message is sent to both the players when new Game is created.
        }
        addMessageHandler(ws);


        // gameManager.addUser(ws, decoded.userId);
    } catch (error) {
        ws.close(1008, 'Authentication failed');
    }

    ws.on("disconnect", () => gameManager.removeuser(ws));
});

function addMessageHandler(socket: WebSocket) {
    socket.on("message", (data) => {
        const message = JSON.parse(data.toString())
        if (message.type === MOVE) {
            const game = games.find(game => game.player1 === socket || game.player2 === socket)
            if (game) {
                game.makeMove(socket, message.move)
            }
        }
    });
}

/*
wss.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const gameId = url.searchParams.get('gameId');
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token || !gameId) {
        socket.destroy();
        return;
    }

    // Verify JWT
    jwt.verify(token, process.env.JWT_SECRET!, (err, decoded) => {
        if (err || !decoded || typeof decoded !== 'object') {
            socket.destroy();
            return;
        }

        const userId = (decoded as any).id;
        // Check if user is allowed in this game (e.g., query PostgreSQL)
        if (!isUserInGame(userId, gameId)) {
            socket.destroy();
            return;
        }
    });
});
*/