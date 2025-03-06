import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Game } from './ws/src/Game.js';
import { DRAW, DRAW_REQUESTED, MOVE, RESIGN } from './ws/src/Messages.js';
import { registerUser } from './auth/auth.js';
import authRouter from './routes/auth.routes.js';
import { WebSocket, WebSocketServer } from 'ws';
import gameRouter from './routes/game.routes.js';
import prismaClient from './services/prismaClient.js';
import { GameManager } from './ws/src/GameManager.js';
import { games, pendingGames, state } from './gameStore.js';
dotenv.config();

const PORT = process.env.PORT || 3000;
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

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}...`);
});




//WS Server index.ts
const wss = new WebSocketServer({ server });
const JWT_SECRET = process.env.JWT_SECRET;
const gameManager = new GameManager();


wss.on('connection', async function connection(ws, req) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    state.onlineUsers.push(ws);
    broadCastOnlineUsersCount();

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

        /**
         * Game is only created  when the Player 2 joins.
         */

        if (userId == game[1]) {
            const foundGame = pendingGames.find(game => game[0] === gameId);
            if (foundGame && userId == foundGame[1]) {
                foundGame[2] = ws;
            }
            console.log(userId + 'has joined the game. A pending game has been created.');
        }
        else {
            pendingGames.splice(pendingGames.indexOf(game), 1);
            const player1 = await prismaClient.user.findUnique({ where: { id: game[1] } });
            const player2 = await prismaClient.user.findUnique({ where: { id: userId } });

            if (player1 === null || player2 === null) {
                console.log('Player1 and Player2 not found, setting up game with user IDs...');
                games.push(
                    new Game(
                        game[0],
                        game[2]!,
                        ws,
                        game[1],
                        userId,
                        5 * 60 * 1000)
                ); // Start Game message is sent to both the players when new Game is created.
            }
            else {
                games.push(
                    new Game(
                        game[0],
                        game[2]!,
                        ws,
                        player1?.username,
                        player2?.username,
                        5 * 60 * 1000)
                );
            }
            console.log(userId + 'has joined the game. An existing game found. Starting game...');
        }
        addMessageHandler(ws);


        // gameManager.addUser(ws, decoded.userId);
    } catch (error) {
        console.log("Websocket error: " + error);
        ws.close(1008, 'Authentication failed');
    }

    ws.on("close", () => {
        console.log('User disconnected');

        //TODO: stop the timers!


        const index = pendingGames.findIndex(game => game[2] === ws);
        if (index !== -1) {
            pendingGames.splice(index, 1);
        }
        if (state.onlineUsers.length > 0) {
            state.onlineUsers = state.onlineUsers.filter(socket => socket !== ws);
        }


        console.log('Online users: ' + state.onlineUsers.length);
        broadCastOnlineUsersCount();
    });
});

function addMessageHandler(socket: WebSocket) {
    socket.on("message", async (data) => {
        const message = JSON.parse(data.toString())
        const game = games.find(game => game.player1 === socket || game.player2 === socket)
        if (message.type === MOVE) {
            if (game) {
                console.log('Move received: ' + message.piece + message.move.from + message.move.to);
                game.makeMove(socket, message.move, message.piece);
            }
        }
        else if (message.type === RESIGN) {
            console.log('Resign received');
            if (game) {
                let result = game.player1 === socket ? '0-1' : '1-0';
                let termination = `${game.player1 === socket ? game.player1Username : game.player2Username} resigned`

                await game.saveMovesToDB();
                await game.addResultData(result, termination);
                games.splice(games.indexOf(game), 1);
                await game.declareResult(
                    { from: '', to: '' },
                    'r',
                    `${game.player1 === socket ? game.player1Username : game.player2Username} resigned`,
                    false
                );
            }
        }
        else if (message.type === DRAW) {
            console.log('Draw request received');
            if (game) {
                if (game.drawCount.size === 0) {
                    game.drawCount.add(socket);
                    if (game.player1 === socket) {
                        game.player2.send(JSON.stringify({
                            type: DRAW_REQUESTED,
                            message: 'DRAW requested'
                        }));
                    }
                    else{
                        game.player1.send(JSON.stringify({
                            type: DRAW_REQUESTED,
                            message: 'DRAW requested'
                        }));
                    }
                }
                else if (game.drawCount.size === 1) {
                    game.drawCount.add(socket);
                    let len = game.drawCount.size;
                    if (len === 2) {
                        let result = '0-0';
                        let termination = `Draw by agreement`;

                        game.saveMovesToDB();
                        game.addResultData(result, termination);
                        games.splice(games.indexOf(game), 1);
                        game.declareResult(
                            { from: '', to: '' },
                            'd',
                            'Draw by agreement'
                        );
                    }
                }
            }
        }
    });
}

function broadCastOnlineUsersCount() {
    const message = JSON.stringify({
        type: 'info',
        onlineUsers: state.onlineUsers.length
    });

    state.onlineUsers.forEach(socket => {
        if (socket.readyState === socket.OPEN) {
            socket.send(message);
        }
    });
}