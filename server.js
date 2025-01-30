const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname));

const players = {};
const spectators = [];
const canvasSize = { width: 900, height: 600 };
const middleLine = canvasSize.width / 2;
let ball = {
    x: Math.random() * canvasSize.width,
    y: 100,
    radius: 10,
    velocityY: 0,
    velocityX: 0,
    gravity: 0.05,
    maxVelocity: 3,
};

io.on("connection", (socket) => {
    console.log(`Gracz ${socket.id} dołączył!`);

    socket.on("joinGame", (playerInfo) => {
        if (Object.keys(players).length < 2) {
            const playerSide = Object.keys(players).length % 2 === 0 ? "left" : "right";
            players[socket.id] = {
                x: playerSide === "left" ? middleLine / 2 : middleLine + middleLine / 2,
                y: canvasSize.height / 2,
                color: playerInfo.color || "#" + Math.floor(Math.random() * 16777215).toString(16),
                nickname: playerInfo.nickname || `Gracz_${Math.floor(Math.random() * 1000)}`,
                velocity: { x: 0, y: 0 },
                side: playerSide,
                radius: 18 
            };
        } else {
            spectators.push({
                id: socket.id,
                nickname: playerInfo.nickname || `Obserwator_${Math.floor(Math.random() * 1000)}`,
                color: playerInfo.color || "#" + Math.floor(Math.random() * 16777215).toString(16),
            });
        }
        io.emit("updatePlayers", { players, spectators });
    });

    socket.on("move", (move) => {
        if (players[socket.id]) {
            let player = players[socket.id];
            player.velocity.x = move.x;
            player.velocity.y = move.y;

            let newX = player.x + player.velocity.x;
            let newY = player.y + player.velocity.y;

            if (player.side === "left") {
                newX = Math.max(15, Math.min(middleLine - 15, newX));
            } else {
                newX = Math.max(middleLine + 15, Math.min(canvasSize.width - 15, newX));
            }

            newY = Math.max(15, Math.min(canvasSize.height - 15, newY));

            player.x = newX;
            player.y = newY;

            io.emit("updatePlayers", { players, spectators });
        }
    });

    socket.on("disconnect", () => {
        console.log(`Gracz ${socket.id} opuścił grę.`);
        
        if (players[socket.id]) {
            const leavingSide = players[socket.id].side; 
            delete players[socket.id];
    
            if (spectators.length > 0) {
 
                const newPlayer = spectators.shift();
                const newSide = Object.values(players).some(p => p.side === "left") ? "right" : "left";
    
                players[newPlayer.id] = {
                    x: newSide === "left" ? middleLine / 2 : middleLine + middleLine / 2,
                    y: canvasSize.height / 2,
                    color: newPlayer.color,
                    nickname: newPlayer.nickname,
                    velocity: { x: 0, y: 0 },
                    side: newSide 
                };
            }
        } else {
            const index = spectators.findIndex(s => s.id === socket.id);
            if (index !== -1) {
                spectators.splice(index, 1);
            }
        }
    
        io.emit("updatePlayers", { players, spectators });
    });
    

    socket.on("glow", (isGlowing) => {
        if (players[socket.id]) {
            players[socket.id].glowing = isGlowing;
            io.emit("updatePlayers", { players, spectators });
        }
    });    

    socket.on("chatMessage", (msg) => {
        const player = players[socket.id] || { nickname: "Obserwator" };
        io.emit("chatMessage", `${player.nickname}: ${msg}`);
    });

    socket.on("hitBall", () => {
        const player = players[socket.id];
        if (player) {
            console.log(`👤 Gracz: x=${player.x}, y=${player.y}`);
            console.log(`🎾 Piłka: x=${ball.x}, y=${ball.y}`);
            if (checkCollision(player, ball)) {
                console.log(`${player.nickname} odbił piłkę!`);
                ball.velocityY = -5;
                ball.velocityX = (Math.random() - 0.5) * 6;
            }
        }
    });
    

    function checkCollision(player, ball) {
        let dx = player.x - ball.x;
        let dy = player.y - ball.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
    
        return distance < player.radius + ball.radius;
    }
    

    setInterval(() => {
        ball.velocityY += ball.gravity;
        if (ball.velocityY > ball.maxVelocity) ball.velocityY = ball.maxVelocity;

        ball.y += ball.velocityY;
        ball.x += ball.velocityX;

        if (ball.y + ball.radius >= canvasSize.height) {
            ball.y = 100;
            ball.x = Math.random() * (canvasSize.width - 2 * ball.radius) + ball.radius;
            ball.velocityY = 0;
            ball.velocityX = 0;
        }
            
        io.emit("updateBall", ball);
    }, 5);
});

server.listen(3000, () => console.log("Serwer działa na porcie 3000 🚀"));
