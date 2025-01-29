import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';

const wss = new WebSocketServer({ port: 8080 });
const gameManager = new GameManager();

wss.on('connection', function connection(ws) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    console.log('New connection established.');
    gameManager.addUser(ws)
    ws.on("disconnect", () => gameManager.removeuser(ws));
});