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
        console.error('WebSocket error on error:', error);
    });

    state.onlineUsers.push(ws);
    broadCastOnlineUsersCount();

    const urlParams = new URLSearchParams(req.url!.split('?')[1]);
    const gameId = urlParams.get('gameId');
    const duration = Number(urlParams.get('duration'));
    const token = req.headers.authorization?.split(' ')[1];
    let decodedToken: { userId: string } = { userId: '' };
    try {
        if (token === undefined) {
            throw new Error('Token is missing!');
        }
        if (token === null) {
            throw new Error('Token is null!');
        }
        if (duration === undefined) {
            throw new Error('Duration is missing!');
        }
        if (JWT_SECRET === undefined) {
            throw new Error('JWT_SECRET is not defined!');
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        decodedToken = decoded;
        console.log(`${decoded.userId} has joined!`);

        // gameManager.addUser(ws, decoded.userId);
    } catch (error) {
        console.log("Websocket error on connection try/catch: " + error);
        ws.close(1008, 'Authentication failed');
    }


    try {
        const userId = decodedToken.userId;
        console.log("Duration searching for: ", duration);
        console.log("gameId we searching for: ", gameId);
        const game = pendingGames.get(duration!)?.find(game => game.gameId === gameId);

        pendingGames.forEach((value, key) => {
            console.log('Key Duration: ' + key);
            console.log('Duration: ' + duration);
            console.log('Type of key duration: ' + typeof key);
            console.log('Type of duration: ' + typeof duration);

            if (key === duration) {
                console.log('Duration matches');
            }
            else {
                console.log('Duration does not match');
            }
            value.forEach(game => {
                console.log('Game ID: ' + game.gameId);
                console.log('User ID: ' + game.userId);
            });
        });

        pendingGames.get(duration!)?.forEach(game => {
            console.log('Game ID: ' + game.gameId);
            console.log('User ID: ' + game.userId);
        });

        if (game === undefined) {
            throw new Error('Game not found!');
        }

        /**
         * Game is only created  when the Player 2 joins.
         */

        if (userId == game.userId) {
            const foundGame = pendingGames.get(duration!)?.find(game => game.gameId === gameId);
            if (foundGame && userId == foundGame.userId) {
                foundGame.ws = ws;
            }
            console.log(userId + 'has joined the game. A pending game has been created.');
        }
        else {
            const index = pendingGames.get(duration!)?.indexOf(game);
            if (index === undefined) {
                console.log('Index is undefined at line 104.');
            }
            else {
                pendingGames.get(duration!)?.splice(index, 1);
                const player1 = await prismaClient.user.findUnique({
                    where: { id: game.userId },
                    omit: {
                        email: true,
                        password: true
                    }
                });
                const player2 = await prismaClient.user.findUnique({
                    where: { id: userId },
                    omit: {
                        email: true,
                        password: true
                    }
                });

                if (player1 === null || player2 === null) {
                    console.error('Player1 or Player2 not found!');
                    throw new Error('Player1 or Player2 not found!');
                }

                let gameType = "";
                if (duration === 1 * 60 * 1000) 
                    gameType = "Bullet";
                else if (duration === 3 * 60 * 1000 || duration === 5 * 60 * 1000)
                    gameType = "Blitz";
                else
                    gameType = "Rapid";

                games.push(
                    new Game(
                        game.gameId,
                        game.ws!,
                        ws,
                        player1,
                        player2,
                        duration,
                        gameType
                    )
                ); // Start Game message is sent to both the players when new Game is created.

                await prismaClient.game.update({
                    where: { id: game.gameId },
                    data: {
                        gameType: gameType
                    }
                });
                console.log(userId + 'has joined the game. An existing game found. Starting game...');
            }
        }
        addMessageHandler(ws);
    } catch (error) {
        console.log('Error in game creation/joining: ' + error);
    }


    ws.on("close", () => {
        console.log('User disconnected');

        //TODO: stop the timers!


        const index = pendingGames.get(duration!)?.findIndex(game => game.ws === ws);
        if (index === undefined) {
            console.log('Index is undefined at line 154.');
        }
        else {
            if (index !== -1) {
                pendingGames.get(duration!)?.splice(index, 1);
            }
            if (state.onlineUsers.length > 0) {
                state.onlineUsers = state.onlineUsers.filter(socket => socket !== ws);
            }
        }


        console.log('Online users: ' + state.onlineUsers.length);
        broadCastOnlineUsersCount();
    });
});

function addMessageHandler(socket: WebSocket) {
    socket.on("message", async (data) => {
        const message = JSON.parse(data.toString())
        const game = games.find(game => game.player1Socket === socket || game.player2Socket === socket)
        if (message.type === MOVE) {
            if (game) {
                console.log('Move received: ' + message.piece + message.move.from + message.move.to);
                game.makeMove(socket, message.move, message.piece);
            }
        }
        else if (message.type === RESIGN) {
            console.log('Resign received');
            if (game) {
                let result = game.player1Socket === socket ? '0-1' : '1-0';
                let termination = `${game.player1Socket === socket ? game.player1.username : game.player2.username} resigned`

                await game.saveMovesToDB();
                await game.addResultData(result, `${game.player1Socket === socket ? game.player1.username : game.player2.username}`, termination);
                games.splice(games.indexOf(game), 1);
                await game.declareResult(
                    { from: '', to: '' },
                    (game.player1Socket === socket) ? 'b' : 'w',
                    `${game.player1Socket === socket ? game.player2.username : game.player1.username}`,
                    `${game.player1Socket === socket ? game.player1.username : game.player2.username} resigned`,
                    false
                );
            }
        }
        else if (message.type === DRAW) {
            console.log('Draw request received');
            if (game) {
                if (game.drawCount.size === 0) {
                    game.drawCount.add(socket);
                    if (game.player1Socket === socket) {
                        game.player2Socket.send(JSON.stringify({
                            type: DRAW_REQUESTED,
                            message: 'DRAW requested'
                        }));
                    }
                    else {
                        game.player1Socket.send(JSON.stringify({
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
                        game.addResultData(result, '~', termination);
                        games.splice(games.indexOf(game), 1);
                        game.declareResult(
                            { from: '', to: '' },
                            'd',
                            '~',
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