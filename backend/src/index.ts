import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Game } from './ws/src/Game';
import { MOVE } from './ws/src/Messages';
import { registerUser } from './auth/auth';
import authRouter from './routes/auth.routes';
import gameRouter from './routes/game.routes';
import { WebSocket, WebSocketServer } from 'ws';
import { games, pendingGames } from './gameStore';
import { GameManager } from './ws/src/GameManager';
import { PrismaClient } from '@prisma/client';
dotenv.config();

const app = express();
const server = createServer(app);
app.use(express.json());

app.use(cors({ origin: "http://10.0.2.2:3000" }));

app.post('/v1/register', async (req, res) => {
    try {
        const user = await registerUser(req.body.email, req.body.password, req.body.username);
        res.status(201)
            .json({
                userId: user.id,
                message: 'User registered successfully!',
            })
    } catch (error: any) {
        res.status(400)
            .json({
                message: error.message
            });
    }
});

app.use('/v1/auth', authRouter);
app.use('/v1/game', gameRouter);

server.listen(3000, () => {
    console.log('Server is listening on port 3000...');
});




//WS Server index.ts
const wss = new WebSocketServer({ server });
const JWT_SECRET = process.env.JWT_SECRET;
const gameManager = new GameManager();
const prisma = new PrismaClient();


wss.on('connection', async function connection(ws, req) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    const urlParams = new URLSearchParams(req.url!.split('?')[1]);
    const gameId = urlParams.get('gameId');
    const token = req.headers.authorization?.split(' ')[1];

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
            console.log(userId + 'has joined the game. A pending game has been created.');
        }
        else {
            pendingGames.splice(pendingGames.indexOf(game), 1);
            const player1 = await prisma.user.findUnique({ where: { id: game[1] } });
            const player2 = await prisma.user.findUnique({ where: { id: userId } });

            if(player1 === null || player2 === null) {
                console.log('Player1 and Player2 not found, setting up game with user IDs...');
                games.push(new Game(game[2]!, ws, game[1], userId)); // Start Game message is sent to both the players when new Game is created.
            }
            else{
                games.push(new Game(game[2]!, ws, player1?.username, player2?.username));
            }
            console.log(userId + 'has joined the game. An existing game found. Starting game...');
        }
        addMessageHandler(ws);


        // gameManager.addUser(ws, decoded.userId);
    } catch (error) {
        console.log("Websocket error: " + error);
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