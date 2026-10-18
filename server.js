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
                friction: 0.6,
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
    
            const acceleration = 0.1; 
            const maxSpeed = 6;
    
            player.velocity.x += move.x * acceleration;
            player.velocity.y += move.y * acceleration;
    
            player.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, player.velocity.x));
            player.velocity.y = Math.max(-maxSpeed, Math.min(maxSpeed, player.velocity.y));
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
            
            const dx = ball.x - player.x;
            const dy = ball.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0) return;
            const normalX = dx / distance;
            const normalY = dy / distance;
    
            let hitStrength = 6;
            
            // Sprawdź czy uderzenie w dolną połowę gracza
            if (ball.y > player.y) {
                hitStrength *= 1.5; // +50% prędkości
                console.log("Uderzenie w dolną połowę! +50% prędkości");
            }
            
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
        
                let hitStrength = 20;
                
                // Sprawdź czy uderzenie w dolną połowę
                if (ball.y > player.y) {
                    hitStrength *= 1.7; // +50% prędkości
                    console.log("Automatyczne uderzenie w dolną połowę! +50%");
                }
                
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

}, 3); // 🔹 Możesz zmieniać interwał, a prędkość pozostanie stała!


// 🔥 **Aktualizacja pozycji piłki co 10ms**
let lastUpdateTime = Date.now();
const scores = { left: 0, right: 0 }; // Punkty dla graczy



function updateBallPhysics() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTime) / 1000;
    const clampedDeltaTime = Math.min(deltaTime, 0.1);

    // 🔹 **Aktualizacja prędkości i pozycji piłki**
    ball.velocityY += ball.gravity * clampedDeltaTime * 60;
    ball.x += ball.velocityX * clampedDeltaTime * 60;
    ball.y += ball.velocityY * clampedDeltaTime * 60;

    // 🔥 **Obsługa kolizji piłki**
    checkNetCollision();
    checkWallCollision();
    checkGroundCollision();

    // 🔥 **Tłumienie prędkości piłki (stopniowe spowolnienie)**
    ball.velocityX *= Math.pow(ball.damping, clampedDeltaTime * 60);
    ball.velocityY *= Math.pow(ball.damping, clampedDeltaTime * 60);

    // 🔥 **Wysyłanie zaktualizowanej pozycji piłki do klientów**
    io.emit("updateBall", ball);
    lastUpdateTime = currentTime;
}

setInterval(updateBallPhysics, 5);

function checkNetCollision() {
    const NET_WIDTH = 2;
    const NET_TOP = canvasSize.height - 250;
    const SHIFT = 0; // Przesunięcie siatki
    
    // Lewa i prawa krawędź siatki
    const leftNet = middleLine - 20;
    const rightNet = middleLine + 20;

    // Tylko gdy piłka jest w okolicy siatki
    if (ball.y + ball.radius < NET_TOP) return;

    // Obliczenie wektora normalnego odbicia
    function calculateBounceDirection(ball, normal) {
        const dot = ball.velocityX * normal.x + ball.velocityY * normal.y;
        return {
            x: ball.velocityX - 2 * dot * normal.x,
            y: ball.velocityY - 2 * dot * normal.y
        };
    }

    // Sprawdzenie, po której stronie znajduje się piłka
    if (ball.x > middleLine) {
        // Odbicie od lewej strony siatki
        if (ball.x - ball.radius < leftNet && ball.x + ball.radius > leftNet - NET_WIDTH) {
            ball.x = leftNet + ball.radius;
            const normal = { x: 1, y: 0 };
            const bounce = calculateBounceDirection(ball, normal);
            ball.velocityX = Math.abs(bounce.x) * 0.8;
            ball.velocityY = bounce.y;
        }
    } else {
        // Odbicie od prawej strony siatki
        if (ball.x + ball.radius > rightNet && ball.x - ball.radius < rightNet + NET_WIDTH) {
            ball.x = rightNet - ball.radius;
            const normal = { x: -1, y: 0 };
            const bounce = calculateBounceDirection(ball, normal);
            ball.velocityX = -Math.abs(bounce.x) * 0.8;
            ball.velocityY = bounce.y;
        }
    }
}




function checkWallCollision() {
    const WALL_OFFSET_LEFT = -20;  // 🔥 Przesunięcie lewej ściany bardziej w lewo
    const WALL_OFFSET_RIGHT = 920; // 🔥 Przesunięcie prawej ściany bardziej w prawo
    const BOUNCE_DAMPING = 0.82;

    if (ball.x - ball.radius < WALL_OFFSET_LEFT) {
        ball.x = WALL_OFFSET_LEFT + ball.radius;
        ball.velocityX *= -BOUNCE_DAMPING; // Odbicie od lewej ściany
        console.log("Piłka odbija się od lewej ściany!");
    } else if (ball.x + ball.radius > WALL_OFFSET_RIGHT) {
        ball.x = WALL_OFFSET_RIGHT - ball.radius;
        ball.velocityX *= -BOUNCE_DAMPING; // Odbicie od prawej ściany
        console.log("Piłka odbija się od prawej ściany!");
    }
}

// 🔹 **Kolizja piłki z podłożem**
function checkGroundCollision() {
    if (ball.y + ball.radius > canvasSize.height + 30) {
        const loser = ball.x < middleLine ? "left" : "right";
        const winner = loser === "left" ? "right" : "left";
        awardPoint(winner);
    }
}

// 🔥 **Funkcja przyznająca punkty i resetująca piłkę**
function awardPoint(winnerSide) {
    scores[winnerSide]++;

    io.emit("updateScores", scores);
    resetBall(winnerSide);
}

// 🔥 **Resetowanie piłki po stronie gracza, który zdobył punkt**
function resetBall(winnerSide) {
    ball.hidden = true;
    io.emit("updateBall", ball);

    setTimeout(() => {
        ball.x = winnerSide === "left" ? middleLine / 2 : middleLine + middleLine / 2;
        ball.y = 100;
        ball.velocityX = 0;
        ball.velocityY = 0;
        ball.hidden = false;
        io.emit("forceResetBall");
    }, 1);
}


// Start serwera
server.listen(3000, () => console.log("Serwer działa na porcie 3000 🚀"));
