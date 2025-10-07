require('dotenv').config({ path: '../.env' });

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const admin = require('firebase-admin');

// Inicialização do Firebase Admin SDK com credenciais da variável de ambiente
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');
    if (!serviceAccount.project_id) {
        throw new Error("Variável de ambiente GOOGLE_APPLICATION_CREDENTIALS_JSON não está configurada ou é inválida.");
    }
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    console.log("🔥 Firebase Admin SDK inicializado com sucesso! Projeto:", admin.app().options.projectId);
} catch (e) {
    if (!/already exists/.test(e.message)) {
        console.error("❌ Erro ao inicializar Firebase Admin SDK:", e);
        throw e;
    }
}

const db = admin.firestore();

// Teste de conexão com o Firestore
async function testFirestore() {
    try {
        const testRef = db.collection('test').doc('connection-test');
        await testRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
        console.log("✅ Conexão com Firestore confirmada!");
    } catch (error) {
        console.error("❌ Erro ao conectar ao Firestore:", error);
    }
}
testFirestore();

const app = express();

// Configuração das origens permitidas (CORS)
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:3000", 
    "https://stop-game-frontend.netlify.app",
    "https://stop-paper.netlify.app"
  ],
  methods: ["GET", "POST"],
  credentials: true
};

app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.status(200).send("Stop Game Backend is running and ready for Socket.IO connections!");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://stop-game-frontend.netlify.app", 
      "https://stop-paper.netlify.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const appId = "stop-game-app";
const roomsCollectionRef = db
    .collection('artifacts')
    .doc(appId)
    .collection('public')
    .doc('data')
    .collection('rooms');

// Função de normalização de respostas
const normalizeAnswer = (answer) => {
    if (!answer || typeof answer !== 'string') return '';
    return answer
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

// ------------------------
// Sanitização e Wrappers
// ------------------------
function sanitizeRoomConfig(config) {
    if (!config || typeof config !== 'object') return config;
    const cleanConfig = { ...config };
    delete cleanConfig.countdownTimerId;
    delete cleanConfig.roundTimerId;
    return cleanConfig;
}

async function saveRoomConfigToFirestore(roomId, config) {
    try {
        const docRef = roomsCollectionRef.doc(roomId);
        await docRef.set(sanitizeRoomConfig(config), { merge: true });
        console.log(`[Firestore] Sala ${roomId} salva/atualizada no Firestore.`);
        return true;
    } catch (error) {
        console.error(`[Firestore Error] Erro ao salvar sala ${roomId}:`, error);
        return false;
    }
}

async function getRoomConfigFromFirestore(roomId) {
    try {
        const doc = await roomsCollectionRef.doc(roomId).get();
        if (doc.exists) {
            console.log(`[Firestore] Configuração da sala ${roomId} recuperada do Firestore.`);
            return doc.data();
        } else {
            console.log(`[Firestore] Sala ${roomId} não encontrada no Firestore.`);
            return null;
        }
    } catch (error) {
        console.error(`[Firestore Error] Erro ao buscar sala ${roomId}:`, error);
        return null;
    }
}

async function deleteRoomConfigFromFirestore(roomId) {
    try {
        await roomsCollectionRef.doc(roomId).delete();
        console.log(`[Firestore] Sala ${roomId} deletada do Firestore.`);
        return true;
    } catch (error) {
        console.error(`[Firestore Error] Erro ao deletar sala ${roomId}:`, error);
        return false;
    }
}

function emitRoomConfig(roomId, config) {
    io.to(roomId).emit("room_config", sanitizeRoomConfig(config));
}

// ------------------------
// Estado do servidor
// ------------------------
const players = {};
const roomConfigs = {};
const playerDisconnectionTimers = {};

// Game utilities
const gameUtils = {
    letters: [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'X', 'Z'
    ],
    generateRandomLetter() {
        return this.letters[Math.floor(Math.random() * this.letters.length)];
    }
};

// Estado do jogo
const gameState = new Map();
const roomsAnswers = new Map();

// Sistema de sorteio de letras sem repetição
const roomLettersUsed = new Map();
const ALL_LETTERS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 
    'U', 'V', 'W', 'X', 'Y', 'Z'
];

// Função para sortear letra sem repetição
function getRandomLetterForRoom(room) {
    if (!roomLettersUsed.has(room)) {
        roomLettersUsed.set(room, []);
    }
    
    const usedLetters = roomLettersUsed.get(room);
    const availableLetters = ALL_LETTERS.filter(letter => !usedLetters.includes(letter));
    
    if (availableLetters.length === 0) {
        console.log(`[Letter System] Todas as letras foram usadas na sala ${room}. Reiniciando ciclo.`);
        roomLettersUsed.set(room, []);
        return getRandomLetterForRoom(room);
    }
    
    const randomIndex = Math.floor(Math.random() * availableLetters.length);
    const selectedLetter = availableLetters[randomIndex];
    
    usedLetters.push(selectedLetter);
    roomLettersUsed.set(room, usedLetters);
    
    console.log(`[Letter System] Sala ${room}: Letra sorteada '${selectedLetter}'. Letras usadas: [${usedLetters.join(', ')}]. Restantes: ${26 - usedLetters.length}`);
    
    return selectedLetter;
}

function clearRoomLetters(room) {
    if (roomLettersUsed.has(room)) {
        roomLettersUsed.delete(room);
        console.log(`[Letter System] Letras usadas da sala ${room} foram limpas.`);
    }
}

// Função para inicializar estado da sala
function initializeRoomState(room) {
    if (!gameState.has(room)) {
        gameState.set(room, {
            answers: new Map(),
            validatorId: null,
            currentValidation: null
        });
    }
    if (!roomsAnswers.has(room)) {
        roomsAnswers.set(room, []);
    }
}

// CORREÇÃO: Função startRoundCountdown com controle de estado
function startRoundCountdown(room) {
    const config = roomConfigs[room];
    if (!config) {
        console.log(`[Countdown] No config found for room ${room}`);
        return;
    }

    // CORREÇÃO: Verificar se já está em countdown para evitar múltiplas execuções
    if (config.isCountingDown) {
        console.log(`[Countdown] Countdown already in progress for room ${room}`);
        return;
    }

    console.log(`[Countdown] Starting countdown for room ${room}`);
    
    let countdown = 3;
    config.isCountingDown = true;
    
    const countdownInterval = setInterval(async () => {
        console.log(`[Countdown] Emitting countdown ${countdown} for room ${room}`);
        io.to(room).emit("round_start_countdown", { countdown });
        
        countdown--;
        
        if (countdown < 0) {
            clearInterval(countdownInterval);
            config.isCountingDown = false;

            const letter = getRandomLetterForRoom(room);
            
            config.currentLetter = letter;
            config.roundActive = true;
            config.roundEnded = false;
            config.stopClickedByMe = false;
            
            await saveRoomConfigToFirestore(room, config);
            
            console.log(`[Countdown] Round started for room ${room} with letter ${letter}`);
            io.to(room).emit("round_started", { letter });
            emitRoomConfig(room, config); // CORREÇÃO: Mudado de roomId para room
        }
    }, 1000);
}

// Função startValidation
function startValidation(room) {
    try {
        console.log(`[Validation] Starting validation for room ${room}`);
        
        const roomState = gameState.get(room);
        const config = roomConfigs[room];
        
        if (!roomState || !config) {
            console.error(`[Validation] Missing state for room ${room}`);
            return;
        }

        const answers = Array.from(roomState.answers.values());
        if (answers.length === 0) {
            console.log(`[Validation] No answers to validate in room ${room}`);
            io.to(room).emit("no_answers_to_validate");
            return;
        }

        const firstTheme = config.themes[0];
        const validationQueue = [];
        
        answers.forEach((playerData, index) => {
            const firstAnswer = playerData.answers[0];
            const answerText = firstAnswer ? firstAnswer.answer : "";
            
            validationQueue.push({
                playerId: playerData.id,
                playerNickname: playerData.nickname,
                theme: firstTheme,
                answer: answerText,
                themeIndex: 0,
                currentPlayerIndex: index,
                totalPlayers: answers.length,
                totalThemes: config.themes.length
            });
        });

        roomState.currentValidation = {
            currentThemeIndex: 0,
            currentPlayerIndex: 0,
            currentIndex: 0,
            queue: validationQueue,
            answers: answers
        };

        const firstValidation = validationQueue[0];
        
        io.to(room).emit("start_validation", {
            current: firstValidation,
            judgeId: roomState.validatorId
        });
        
    } catch (error) {
        console.error('[Validation] Error starting validation:', error);
    }
}

// Sistema de pontuação inteligente por tema
function applyThemeScoring(room, themeIndex, allAnswers, themes) {
    try {
        const themeName = themes[themeIndex];
        console.log(`[Scoring] Aplicando pontuação para tema ${themeIndex}: ${themeName}`);
        
        const themeAnswers = [];
        allAnswers.forEach(player => {
            const answer = player.answers[themeIndex];
            if (answer) {
                themeAnswers.push({
                    player: player,
                    answer: answer,
                    normalizedAnswer: normalizeAnswer(answer.answer)
                });
            }
        });
        
        themeAnswers.forEach(({ answer, normalizedAnswer }) => {
            if (answer.valid === false) {
                answer.points = 0;
                answer.reason = "Invalidada pelo juiz";
                return;
            }
            
            if (!normalizedAnswer || normalizedAnswer.length === 0) {
                answer.points = 0;
                answer.reason = "Resposta vazia";
                return;
            }
        });

        const answerGroups = new Map();
        
        themeAnswers.forEach(({ player, answer, normalizedAnswer }) => {
            if (answer.points !== null) return;
            
            if (!answerGroups.has(normalizedAnswer)) {
                answerGroups.set(normalizedAnswer, []);
            }
            answerGroups.get(normalizedAnswer).push({ player, answer });
        });
        
        answerGroups.forEach((group, normalizedAnswer) => {
            let points = 0;
            let reason = "";
            
            if (group.length === 1) {
                points = 100;
                reason = normalizedAnswer.length === 1 ? "Resposta única (uma letra)" : "Resposta única";
            } else {
                points = 50;
                reason = normalizedAnswer.length === 1 ? 
                    `Resposta repetida - uma letra (${group.length} jogadores)` :
                    `Resposta repetida (${group.length} jogadores)`;
            }
            
            group.forEach(({ answer }) => {
                answer.points = points;
                answer.reason = reason;
            });
            
            console.log(`[Scoring] Tema ${themeName} - Resposta "${normalizedAnswer}" - ${group.length} jogador(es) - ${points} pontos cada`);
        });
        
    } catch (error) {
        console.error(`[Scoring] Erro ao aplicar pontuação para tema ${themeIndex}:`, error);
    }
}

// Lógica Socket.IO
io.on('connection', (socket) => {
    console.log(`[Socket.io] Nova conexão: ${socket.id}`);

    socket.on('join_room', async (data) => {
        try {
            const roomId = data.roomId || data.room;
            const nickname = data.nickname;
            const userId = data.userId;
            
            console.log(`[Backend Log - join_room] Tentativa de entrada: userId=${userId}, roomId=${roomId}, nickname=${nickname}`);
            
            if (!roomId || !nickname || !userId) {
                console.error(`[Backend Log - join_room] Dados inválidos`);
                socket.emit('error', { message: 'Dados inválidos para entrar na sala' });
                return;
            }

            socket.userId = userId;
            socket.nickname = nickname;
            socket.room = roomId;
            socket.join(roomId);

            const socketsInRoom = await io.in(roomId).fetchSockets();
            const connectedUserIds = socketsInRoom.map(s => s.userId).filter(Boolean);

            let roomConfig = await getRoomConfigFromFirestore(roomId);
            
            if (!roomConfig) {
                console.log(`[Backend Log - join_room] Criando nova sala ${roomId}`);
                roomConfig = {
                    themes: ['País', 'Cidade', 'Nome', 'Animal', 'Cor', 'Marca', 'CEP', 'Objeto', 'Fruta'],
                    duration: 180,
                    creatorId: null,
                    roundActive: false,
                    roundEnded: false,
                    currentLetter: null,
                    isSaved: false,
                    isCountingDown: false, // CORREÇÃO: Adicionar controle de countdown
                    createdAt: new Date(),
                    players: {}
                };
            } else {
                console.log(`[Backend Log - join_room] Sala ${roomId} encontrada no Firestore.`);
                
                // CORREÇÃO: Sempre resetar estados de rodada para novos jogadores
                roomConfig.roundActive = false;
                roomConfig.roundEnded = false;
                roomConfig.currentLetter = null;
                roomConfig.isCountingDown = false;
                
                const currentPlayers = roomConfig.players || {};
                const validPlayers = {};
                
                Object.values(currentPlayers).forEach(player => {
                    if (connectedUserIds.includes(player.userId) || player.userId === userId) {
                        validPlayers[player.userId] = player;
                    }
                });
                
                roomConfig.players = validPlayers;
            }

            let isCreator = false;
            const existingPlayers = Object.values(roomConfig.players);
            const hasActiveAdmin = existingPlayers.some(p => p.isCreator && connectedUserIds.includes(p.userId));
            
            if (!hasActiveAdmin || existingPlayers.length === 0) {
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) será o ADMIN da sala ${roomId}`);
                roomConfig.creatorId = userId;
                isCreator = true;
                
                Object.values(roomConfig.players).forEach(p => p.isCreator = false);
            } else {
                isCreator = userId === roomConfig.creatorId;
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) ${isCreator ? 'É o ADMIN' : 'NÃO é criador'} da sala ${roomId}`);
            }

            roomConfig.players[userId] = {
                userId,
                nickname,
                isCreator,
                socketId: socket.id,
                joinedAt: new Date()
            };

            roomConfigs[roomId] = roomConfig;
            await saveRoomConfigToFirestore(roomId, roomConfig);

            const playersArray = Object.values(roomConfig.players).sort((a, b) => {
                if (a.isCreator && !b.isCreator) return -1;
                if (!a.isCreator && b.isCreator) return 1;
                return new Date(a.joinedAt) - new Date(b.joinedAt);
            });

            console.log(`[Backend Log - join_room] ✅ ${nickname} entrou na sala ${roomId}. É ADMIN: ${isCreator ? 'SIM' : 'NÃO'}. Total: ${playersArray.length}`);

            socket.emit('room_joined', {
                room: roomId,
                player: {
                    userId,
                    nickname,
                    isCreator
                },
                players: playersArray
            });

            io.to(roomId).emit('players_update', playersArray);
            emitRoomConfig(roomId, roomConfig);

        } catch (error) {
            console.error('[Backend Log - join_room] Erro:', error);
            socket.emit('error', { message: 'Erro ao entrar na sala' });
        }
    });

    socket.on('update_themes', async ({ room, themes }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized theme update attempt by ${socket.userId}`);
                return;
            }

            config.themes = themes;
            config.isSaved = false;

            await saveRoomConfigToFirestore(room, config);
            
            io.to(room).emit('themes_updated', { themes });
            emitRoomConfig(room, config);
            
            console.log(`[Socket.io] Themes updated for room ${room}:`, themes);

        } catch (error) {
            console.error('[Socket.io] Error updating themes:', error);
        }
    });

    socket.on('update_config', async ({ room, themes, duration }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                throw new Error("Unauthorized config update");
            }

            if (themes) config.themes = themes;
            if (duration) config.duration = duration;
            
            config.isSaved = false;

            await saveRoomConfigToFirestore(room, config);
            emitRoomConfig(room, config);

        } catch (error) {
            console.error('[Socket.io] Error updating config:', error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('save_room', async ({ room, roomName }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                throw new Error("Unauthorized save attempt");
            }

            config.isSaved = true;
            await saveRoomConfigToFirestore(room, config);
            
            socket.emit('room_saved_success', { room });
            emitRoomConfig(room, config);

        } catch (error) {
            console.error('[Socket.io] Error saving room:', error);
            socket.emit('error', { message: error.message });
        }
    });

    // CORREÇÃO: start_round com controle adequado
    socket.on('start_round', async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized start_round attempt by ${socket.userId} in room ${room}`);
                return;
            }

            // CORREÇÃO: Verificar se já está ativo ou em countdown
            if (config.roundActive || config.roundEnded || config.isCountingDown) {
                console.log(`[Socket.io] Cannot start round - round already active/ended/counting in room ${room}`);
                return;
            }

            console.log(`[Socket.io] Admin ${socket.userId} starting round in room ${room}`);
            
            startRoundCountdown(room);

        } catch (error) {
            console.error('[Socket.io] Error starting round:', error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('submit_answers', async ({ room, answers }) => {
        try {
            console.log(`[Socket.io] Submit answers received from ${socket.userId} for room ${room}`);
            
            if (!gameState.has(room)) {
                initializeRoomState(room);
            }

            const state = gameState.get(room);
            const config = roomConfigs[room];
            let nickname = "Unknown";
            
            if (socket.nickname) {
                nickname = socket.nickname;
            } else if (config && config.players && config.players[socket.userId]) {
                nickname = config.players[socket.userId].nickname;
            }
            
            state.answers.set(socket.userId, {
                id: socket.userId,
                nickname: nickname,
                answers: answers.map(a => ({
                    theme: a.theme,
                    answer: a.answer || "",
                    points: null,
                    validated: false
                }))
            });

            console.log(`[Socket.io] Answers saved for player ${nickname} in room ${room}`);
            
        } catch (error) {
            console.error('[Socket.io] Error saving answers:', error);
        }
    });

    socket.on('stop_round', async (data = {}) => {
        try {
            const room = data.room || socket.room;
            if (!room) throw new Error("Room not specified");

            console.log(`[Socket.io] 🛑 Jogador ${socket.userId} clicou STOP na sala ${room}`);
            
            const config = roomConfigs[room];
            if (!config || !config.roundActive) {
                console.log(`[Socket.io] Stop ignored - round not active in room ${room}`);
                return; // CORREÇÃO: Retornar em vez de throw error
            }

            // CORREÇÃO: Encontrar admin para ser o validador
            const adminPlayer = Object.values(config.players).find(p => p.isCreator);
            if (!adminPlayer) {
                console.log(`[Socket.io] No admin found in room ${room}`);
                return;
            }

            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = socket.userId;

            if (!gameState.has(room)) {
                initializeRoomState(room);
            }
            gameState.get(room).validatorId = adminPlayer.userId; // CORREÇÃO: Admin como validador

            await saveRoomConfigToFirestore(room, config);

            io.to(room).emit("round_ended");
            emitRoomConfig(room, config);

            console.log(`[Socket.io] Round ended for room ${room}, admin ${adminPlayer.nickname} is validator`);

            // CORREÇÃO: Aguardar um tempo para que todos enviem suas respostas
            setTimeout(() => {
                console.log(`[Socket.io] Iniciando validação após timeout na sala ${room}`);
                const roomState = gameState.get(room);
                const answers = Array.from(roomState.answers.values());
                console.log(`[Socket.io] Respostas encontradas após timeout: ${answers.length}`);
                
                if (answers.length > 0) {
                    startValidation(room);
                } else {
                    console.log(`[Socket.io] Ainda sem respostas na sala ${room} - emitindo no_answers_to_validate`);
                    io.to(room).emit("no_answers_to_validate");
                }
            }, 2000); // CORREÇÃO: 2 segundos para aguardar respostas

        } catch (error) {
            console.error('[Socket.io] Error in stop_round:', error);
            socket.emit("error", { message: error.message });
        }
    });

    socket.on('reveal', ({ room }) => {
        console.log(`[Socket.io] Reveal requested for room ${room}`);
        io.to(room).emit('reveal');
    });

    socket.on('reveal_answer', ({ room }) => {
        console.log(`[Socket.io] Reveal answer requested for room ${room}`);
        io.to(room).emit('reveal');
    });

    socket.on("validate_answer", async ({ valid, room }) => {
        try {            
            const roomState = gameState.get(room);
            const config = roomConfigs[room];
            
            if (!roomState || !roomState.currentValidation) {
                console.error(`[Validation] No validation in progress for room ${room}`);
                return;
            }

            const validation = roomState.currentValidation;
            const current = validation.queue[validation.currentIndex];
            
            let finalValid = valid;
            let reason = '';
            
            if (valid) {
                if (!current.answer || current.answer.trim().length === 0) {
                    finalValid = false;
                    reason = 'Resposta vazia';
                } else {
                    finalValid = true;
                    reason = 'Resposta válida';
                }
            } else {
                finalValid = false;
                reason = 'Resposta inválida';
            }

            const playerAnswers = validation.answers.find(p => p.id === current.playerId);
            if (playerAnswers && playerAnswers.answers) {
                const answerIndex = playerAnswers.answers.findIndex(a => a.theme === current.theme);
                if (answerIndex !== -1) {
                    playerAnswers.answers[answerIndex].valid = finalValid;
                    playerAnswers.answers[answerIndex].reason = reason;
                }
            }

            validation.currentIndex++;
            
            if (validation.currentIndex < validation.queue.length) {
                const next = validation.queue[validation.currentIndex];
                io.to(room).emit('answer_validated', { current: next });
            } else {
                validation.currentThemeIndex++;
                
                if (validation.currentThemeIndex < config.themes.length) {
                    applyThemeScoring(room, validation.currentThemeIndex - 1, validation.answers, config.themes);
                    
                    const nextTheme = config.themes[validation.currentThemeIndex];
                    validation.queue = validation.answers.map((player, index) => {
                        const themeAnswer = player.answers[validation.currentThemeIndex];
                        const answerText = themeAnswer ? themeAnswer.answer : "";
                        
                        return {
                            playerId: player.id,
                            playerNickname: player.nickname,
                            theme: nextTheme,
                            answer: answerText,
                            themeIndex: validation.currentThemeIndex,
                            currentPlayerIndex: index,
                            totalPlayers: validation.answers.length,
                            totalThemes: config.themes.length
                        };
                    });
                    
                    validation.currentIndex = 0;
                    const firstOfNextTheme = validation.queue[0];
                    io.to(room).emit('answer_validated', { current: firstOfNextTheme });
                    
                } else {
                    applyThemeScoring(room, validation.currentThemeIndex - 1, validation.answers, config.themes);
                    
                    validation.answers.forEach(player => {
                        const roundScore = player.answers.reduce((sum, a) => sum + (a.points || 0), 0);
                        
                        if (!roomState.playerScores) {
                            roomState.playerScores = new Map();
                        }
                        
                        const currentTotalScore = roomState.playerScores.get(player.id) || 0;
                        const newTotalScore = currentTotalScore + roundScore;
                        roomState.playerScores.set(player.id, newTotalScore);
                        
                        const myAnswersWithDetails = player.answers.map(answer => ({
                            theme: answer.theme,
                            answer: answer.answer || "",
                            points: answer.points || 0,
                            reason: answer.reason || "Não validada",
                            validated: true
                        }));
                        
                        const allSockets = Array.from(io.sockets.sockets.values());
                        const playerSocket = allSockets.find(s => 
                            s.room === room && s.userId === player.id
                        );
                        
                        if (playerSocket) {
                            playerSocket.emit("validation_complete", { 
                                myScore: roundScore,
                                myTotalScore: newTotalScore,
                                myAnswers: myAnswersWithDetails,
                                roundComplete: true
                            });
                        }
                    });
                    
                    roomState.currentValidation = null;
                }
            }
            
        } catch (error) {
            console.error('[Validation] Error in validate_answer:', error);
        }
    });

    socket.on("new_round", async ({ room, resetLetters = false }) => {
        try {
            console.log(`[Socket.io] New round requested for room ${room} by ${socket.userId}`);
            
            const config = roomConfigs[room];
            if (!config) {
                console.error(`[Socket.io] Room config not found for ${room}`);
                return;
            }
            
            // CORREÇÃO: Verificar se o usuário é admin
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized new_round attempt by ${socket.userId} in room ${room}`);
                return;
            }

            if (resetLetters) {
                clearRoomLetters(room);
            }

            // CORREÇÃO: Reset completo dos estados
            config.roundActive = false;
            config.roundEnded = false;
            config.stopClickedByMe = false;
            config.currentLetter = null;
            config.isCountingDown = false;
            config.gameEnded = false; // CORREÇÃO: Reset gameEnded
            
            if (gameState.has(room)) {
                const roomState = gameState.get(room);
                roomState.answers.clear();
                roomState.currentValidation = null;
                // NÃO limpar playerScores para manter pontuação total
            }

            await saveRoomConfigToFirestore(room, config);

            console.log(`[Socket.io] New round started for room ${room}`);

            io.to(room).emit("new_round_started", {
                message: "Nova rodada iniciada!",
                themes: config.themes
            });
            
            emitRoomConfig(room, config);
            
        } catch (error) {
            console.error('[Socket.io] Error starting new round:', error);
        }
    });

    socket.on('end_game', async ({ room }) => {
        try {
            console.log(`[Socket.io] Game end requested for room ${room} by ${socket.userId}`);
            
            const config = roomConfigs[room];
            if (!config) {
                console.log(`[Socket.io] No config found for room ${room}`);
                return;
            }
            
            // CORREÇÃO: Verificar se o usuário é admin
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized end_game attempt by ${socket.userId} in room ${room}`);
                return;
            }
            
            // CORREÇÃO: Verificar se o jogo já foi encerrado
            if (config.gameEnded) {
                console.log(`[Socket.io] Game already ended for room ${room}`);
                return;
            }
            
            // CORREÇÃO: Marcar jogo como encerrado
            config.gameEnded = true;
            config.roundActive = false;
            config.roundEnded = false;
            config.isCountingDown = false;
            
            await saveRoomConfigToFirestore(room, config);
            
            console.log(`[Socket.io] Game ended for room ${room}`);
            
            const roomState = gameState.get(room);
            const ranking = [];
            
            if (roomState && roomState.playerScores) {
                for (const [playerId, totalScore] of roomState.playerScores.entries()) {
                    const playerConfig = config.players[playerId];
                    if (playerConfig) {
                        ranking.push({
                            playerId: playerId,
                            nickname: playerConfig.nickname,
                            totalScore: totalScore
                        });
                    }
                }
            }

            ranking.sort((a, b) => b.totalScore - a.totalScore);
            
            console.log(`[Socket.io] Final ranking for room ${room}:`, ranking.map(p => `${p.nickname}: ${p.totalScore}`));
            
            io.to(room).emit('game_ended', ranking);
            
            // CORREÇÃO: Limpar estados após um delay para permitir que o frontend processe
            setTimeout(() => {
                gameState.delete(room);
                clearRoomLetters(room);
                console.log(`[Socket.io] Room ${room} state cleared`);
            }, 1000);
            
        } catch (error) {
            console.error('[Socket.io] Error in end_game:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            const userId = socket.userId;
            const room = socket.room;

            console.log(`[Socket.io] Socket desconectado. userId: ${userId}, Sala: ${room}`);

            if (userId && room && roomConfigs[room]) {
                const wasAdmin = roomConfigs[room].players[userId]?.isCreator;
                
                delete roomConfigs[room].players[userId];

                const remainingPlayers = Object.values(roomConfigs[room].players);
                
                if (remainingPlayers.length === 0) {
                    console.log(`[Socket.io] Sala ${room} completamente vazia.`);
                    delete roomConfigs[room];
                    gameState.delete(room);
                    clearRoomLetters(room);
                } else if (wasAdmin) {
                    const sortedPlayers = remainingPlayers.sort((a, b) => 
                        new Date(a.joinedAt) - new Date(b.joinedAt)
                    );
                    
                    const newAdmin = sortedPlayers[0];
                    roomConfigs[room].creatorId = newAdmin.userId;
                    
                    Object.values(roomConfigs[room].players).forEach(p => p.isCreator = false);
                    roomConfigs[room].players[newAdmin.userId].isCreator = true;
                    
                    console.log(`[Socket.io] Novo admin: ${newAdmin.nickname}`);

                    const playersArray = Object.values(roomConfigs[room].players).sort((a, b) => {
                        if (a.isCreator && !b.isCreator) return -1;
                        if (!a.isCreator && b.isCreator) return 1;
                        return new Date(a.joinedAt) - new Date(b.joinedAt);
                    });

                    io.to(room).emit('players_update', playersArray);
                    emitRoomConfig(room, roomConfigs[room]);
                    saveRoomConfigToFirestore(room, roomConfigs[room]);
                }
            }

        } catch (error) {
            console.error('[Socket.io] Error on disconnect:', error);
        }
    });

    socket.on('time_up', async ({ room }) => {
        try {
            console.log(`[Socket.io] ⏰ Tempo esgotado na sala ${room}`);
            
            const config = roomConfigs[room];
            if (!config || !config.roundActive) {
                console.log(`[Socket.io] Time up ignored - round not active in room ${room}`);
                return;
            }

            const adminPlayer = Object.values(config.players).find(p => p.isCreator);
            if (!adminPlayer) {
                console.log(`[Socket.io] No admin found in room ${room} for time up`);
                return;
            }

            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = 'TIME_UP';

            if (!gameState.has(room)) {
                initializeRoomState(room);
            }
            
            const roomState = gameState.get(room);
            roomState.validatorId = adminPlayer.userId;

            await saveRoomConfigToFirestore(room, config);

            io.to(room).emit("time_up_round_ended");
            emitRoomConfig(room, config);

            const answers = Array.from(roomState.answers.values());
            if (answers.length > 0) {
                setTimeout(() => startValidation(room), 1500);
            } else {
                io.to(room).emit("no_answers_to_validate");
            }
            
        } catch (error) {
            console.error('[Socket.io] Error in time_up:', error);
        }
    });

    socket.on('get_room_config', async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (config) {
                socket.emit('room_config', {
                    themes: config.themes || [],
                    duration: config.duration || 180,
                    roundActive: config.roundActive || false,
                    roundEnded: config.roundEnded || false,
                    currentLetter: config.currentLetter || null,
                    isSaved: config.isSaved || false
                });
            } else {
                socket.emit('room_config', {
                    themes: [],
                    duration: 180,
                    roundActive: false,
                    roundEnded: false,
                    currentLetter: null,
                    isSaved: false
                });
            }
        } catch (error) {
            console.error('[Backend] Error in get_room_config:', error);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
