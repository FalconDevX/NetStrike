const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serwowanie plików statycznych
app.use(express.static(__dirname));

// Globalne zmienne gry
const players = {};
const spectators = [];
const canvasSize = { width: 900, height: 600 };
const middleLine = canvasSize.width / 2;

// Inicjalizacja piłki
let ball = {
    x: Math.random() * canvasSize.width,
    y: 100,
    radius: 10,
    velocityY: 0,
    velocityX: 0,
    gravity: 0.2,
    damping: 0.98
};

// Obsługa połączeń socketowych
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
                acceleration: 0.2,
                friction: 0.8,
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

    socket.on("move", (position) => {
        if (players[socket.id]) {
            players[socket.id].x = position.x;
            players[socket.id].y = position.y;
        }
    });
    
    

    socket.on("disconnect", () => {
        console.log(`Gracz ${socket.id} opuścił grę.`);
        delete players[socket.id];
        io.emit("updatePlayers", { players, spectators });
    });

    socket.on("glow", (isGlowing) => {
        if (players[socket.id]) {
            players[socket.id].glowing = isGlowing;
            players[socket.id].isHitting = isGlowing; // Nowa flaga
            io.emit("updatePlayers", { players, spectators });
        }
    });

    socket.on("chatMessage", (msg) => {
        const player = players[socket.id] || { nickname: "Obserwator" };
        io.emit("chatMessage", `${player.nickname}: ${msg}`);
    });

    socket.on("hitBall", () => {
        const player = players[socket.id];
        if (player && checkCollision(player, ball)) {
            console.log(`${player.nickname} odbił piłkę!`);
            
            // Oblicz wektor normalny kolizji
            const dx = ball.x - player.x;
            const dy = ball.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0) return;
            const normalX = dx / distance;
            const normalY = dy / distance;
    
            const hitStrength = 6;
            
            // Ustaw prędkość piłki w kierunku normalnej
            ball.velocityX = normalX * hitStrength;
            ball.velocityY = normalY * hitStrength;
            
                    
        }
    });

    
});

function checkCollision(player, ball) {
    let dx = player.x - ball.x;
    let dy = player.y - ball.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    return distance < player.radius + ball.radius;
}

let lastPlayerUpdateTime = Date.now(); // Unikalna zmienna do śledzenia czasu aktualizacji graczy

setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastPlayerUpdateTime) / 1000; // Przekształcenie na sekundy
    lastPlayerUpdateTime = now; // Aktualizacja znacznika czasu

    for (const id in players) {
        let player = players[id];

        // 🔹 **Stosowanie tarcia względem deltaTime**
        player.velocity.x *= Math.pow(player.friction, deltaTime * 60);
        player.velocity.y *= Math.pow(player.friction, deltaTime * 60);

        // 🔹 **Aktualizacja pozycji gracza uwzględniając deltaTime**
        player.x += player.velocity.x * deltaTime * 60;
        player.y += player.velocity.y * deltaTime * 60;

        // 🔹 **Ograniczenie obszaru gry**
        if (player.side === "left") {
            player.x = Math.max(15, Math.min(middleLine - 15, player.x));
        } else {
            player.x = Math.max(middleLine + 15, Math.min(canvasSize.width - 15, player.x));
        }
        player.y = Math.max(15, Math.min(canvasSize.height - 15, player.y));

        // 🔹 **Automatyczne odbijanie piłki przy ruchu i trzymaniu spacji**
        if (player.isHitting && (player.velocity.x !== 0 || player.velocity.y !== 0)) {
            if (checkCollision(player, ball)) {
                const dx = ball.x - player.x;
                const dy = ball.y - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance === 0) return;
                const normalX = dx / distance;
                const normalY = dy / distance;
        
                const hitStrength = 15;
                
                ball.velocityX = normalX * hitStrength;
                ball.velocityY = normalY * hitStrength;
                
                ball.velocityX += player.velocity.x * 0.5;
                ball.velocityY += player.velocity.y * 0.5;
                
                console.log(`${player.nickname} odbija w ruchu!`);
            }
        }
    }

    // 🔥 **Wysyłanie pozycji graczy do klientów**
    io.emit("updatePlayers", { players });

}, 30); // 🔹 Możesz zmieniać interwał, a prędkość pozostanie stała!


// 🔥 **Aktualizacja pozycji piłki co 10ms**
let lastUpdateTime = Date.now();
setInterval(() => {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTime) / 1000;
    const clampedDeltaTime = Math.min(deltaTime, 0.1);

    ball.velocityY += ball.gravity * clampedDeltaTime * 60;
    
    if (ball.x - ball.radius <= -20 || ball.x + ball.radius >= 920) {

        ball.velocityX *= -ball.damping;
    }
    
    ball.velocityX *= Math.pow(ball.damping, clampedDeltaTime * 60);
    ball.velocityY *= Math.pow(ball.damping, clampedDeltaTime * 60);

    ball.y += ball.velocityY * clampedDeltaTime * 60;
    ball.x += ball.velocityX * clampedDeltaTime * 60;

    if (ball.y + ball.radius > 630) {
        console.log(`Piłka dotknęła dna! Współrzędne: x=${ball.x}, y=${ball.y}`);

        // 🔥 **Ukrycie piłki przed resetem**
        ball.hidden = true;
        io.emit("updateBall", ball);

        setTimeout(() => {
            // 🔹 **Reset piłki i aktualizacja natychmiastowa**
            ball.x = ball.x < middleLine ? canvasSize.width - 100 : 100;
            ball.y = 100;
            ball.velocityX = 0;
            ball.velocityY = 0;
            ball.hidden = false;

            io.emit("updateBall", ball);
            io.emit("forceResetBall"); // Powiadomienie klienta o natychmiastowej zmianie
        }, 5);
    } else {
        io.emit("updateBall", ball);
    }
 
        
    io.emit("updateBall", ball);
    lastUpdateTime = currentTime;
}, 5);

// Start serwera
server.listen(3000, () => console.log("Serwer działa na porcie 3000 🚀"));
