import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import jwt from 'jsonwebtoken';

const wss = new WebSocketServer({ port: 8080 });
const JWT_SECRET = process.env.JWT_SECRET;
const gameManager = new GameManager();

wss.on('connection', function connection(ws, req) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    const token = new URL(req.url || '', `http://${req.headers.host}`).searchParams.get('token');

    try {
        if(token === undefined){
            throw new Error('Token is missing!');
        }
        if(token === null){
            throw new Error('Token is null!');
        }
        if(JWT_SECRET === undefined){
            throw new Error('JWT_SECRET is not defined!');
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        console.log(`${decoded.userId} has joined!`);
        gameManager.addUser(ws, decoded.userId);
    } catch (error) {
        ws.close(1008, 'Authentication failed');
    }

    ws.on("disconnect", () => gameManager.removeuser(ws));
});