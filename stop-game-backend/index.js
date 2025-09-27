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
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://stop-paper.netlify.app']
    : ['http://localhost:5173', 'https://stop-paper.netlify.app'];

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"]
}));

app.get('/', (req, res) => {
    res.status(200).send("Stop Game Backend is running and ready for Socket.IO connections!");
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
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
const stopCallers = {};
const validationStates = {};
const roomConfigs = {};
const roomOverallScores = {}; // Overall scores for the entire game
const playerDisconnectionTimers = {}; // Mantenha um mapa de temporizadores de desconexão para admins

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
            return;
        }

        // DEBUG: Log dos jogadores conectados na sala
        const connectedSockets = Array.from(io.sockets.sockets.values())
            .filter(s => s.room === room)
            .map(s => ({ id: s.userId, socketId: s.id }));
        console.log(`[Validation] Connected sockets in room ${room}:`, connectedSockets);

        // Inicializar validação por tema
        roomState.currentValidation = {
            currentThemeIndex: 0,
            currentPlayerIndex: 0,
            answers,
            validatedAnswers: []
        };

        const firstPlayer = answers[0];
        const firstTheme = config.themes[0];

        console.log(`[Validation] Emitting start_validation for room ${room} - Theme: ${firstTheme}, Player: ${firstPlayer.nickname}`);
        
        io.to(room).emit("start_validation", {
            current: {
                playerId: firstPlayer.id,
                playerNickname: firstPlayer.nickname,
                themeIndex: 0,
                theme: firstTheme,
                answer: firstPlayer.answers[0]?.answer || "",
                validated: false,
                totalPlayers: answers.length,
                currentPlayerIndex: 0,
                totalThemes: config.themes.length
            },
            judgeId: roomState.validatorId
        });
    } catch (error) {
        console.error('[Validation] Error starting validation:', error);
    }
}

// Sistema de pontuação inteligente
function applyScoring(allAnswers, themeIndex) {
    try {
        console.log(`[Scoring] Aplicando pontuação para tema ${themeIndex}`);
        
        // Agrupar respostas por similaridade (normalizado)
        const answerGroups = new Map();
        
        allAnswers.forEach(player => {
            const answer = player.answers[themeIndex];
            if (!answer) return;
            
            const normalizedAnswer = normalizeAnswer(answer.answer);
            const judgeValid = answer.judgeValidation;
            
            // Se foi invalidada pelo juiz, pontuação 0
            if (judgeValid === false) {
                answer.points = 0;
                answer.reason = "Invalidada pelo juiz";
                return;
            }
            
            // Se resposta vazia ou muito curta, pontuação 0
            if (!normalizedAnswer || normalizedAnswer.length < 2) {
                answer.points = 0;
                answer.reason = "Resposta vazia ou muito curta";
                return;
            }
            
            // Agrupar por resposta normalizada
            if (!answerGroups.has(normalizedAnswer)) {
                answerGroups.set(normalizedAnswer, []);
            }
            answerGroups.get(normalizedAnswer).push({ player, answer });
        });
        
        // Aplicar pontuação baseada na quantidade de jogadores com a mesma resposta
        answerGroups.forEach((group, normalizedAnswer) => {
            let points = 0;
            let reason = "";
            
            if (group.length === 1) {
                // Resposta única
                points = 100;
                reason = "Resposta única";
            } else {
                // Resposta duplicada
                points = 50;
                reason = `Resposta repetida (${group.length} jogadores)`;
            }
            
            // Aplicar pontuação para todos do grupo
            group.forEach(({ answer }) => {
                answer.points = points;
                answer.reason = reason;
            });
            
            console.log(`[Scoring] Resposta "${normalizedAnswer}" - ${group.length} jogador(es) - ${points} pontos cada`);
        });
        
        console.log(`[Scoring] Pontuação aplicada para tema ${themeIndex}`);
        
    } catch (error) {
        console.error('[Scoring] Erro ao aplicar pontuação:', error);
    }
}

// Lógica Socket.IO
io.on('connection', (socket) => {
    console.log(`[Socket.io] Nova conexão: ${socket.id}`);

    // JOIN ROOM - Corrigido para garantir primeiro jogador como admin
    socket.on('join_room', async ({ userId, room, nickname }) => {
        try {
            console.log(`[Backend Log - join_room] Tentativa de entrada: userId=${userId}, roomId=${room}, nickname=${nickname}`);

            if (!userId || !room || !nickname) {
                throw new Error("Dados obrigatórios não fornecidos");
            }

            socket.userId = userId;
            socket.room = room;
            socket.join(room);

            // Inicializar estado da sala
            initializeRoomState(room);

            // Verificar quantos jogadores já estão na sala EM MEMÓRIA
            const playersCurrentlyInRoom = Object.values(players).filter(p => p.room === room);
            console.log(`[Backend Log - join_room] Jogadores já na sala ${room} em memória:`, playersCurrentlyInRoom.length);

            // Verificar se a sala existe no Firestore
            let config = await getRoomConfigFromFirestore(room);
            let isCreator = false;
            let isSaved = false;

            if (!config) {
                // Nova sala - primeiro jogador é sempre admin
                console.log(`[Backend Log - ADMIN ASSIGN] Sala ${room} não existe. ${nickname} (${userId}) é o CRIADOR da nova sala.`);
                
                config = {
                    roomId: room,
                    creatorId: userId, // Primeiro jogador é sempre o criador
                    themes: ['País', 'Cidade', 'Nome', 'Animal', 'Cor', 'Marca'],
                    duration: 60,
                    roundActive: false,
                    roundEnded: false,
                    currentLetter: null,
                    stopClickedByMe: null,
                    isSaved: false, // Nova sala não salva por padrão
                    players: []
                };
                
                isCreator = true;
                isSaved = false;
                await saveRoomConfigToFirestore(room, config);
            } else {
                // Sala existe no Firestore
                console.log(`[Backend Log - join_room] Sala ${room} encontrada no Firestore. creatorId: ${config.creatorId}`);
                
                // Verificar se há criador definido E se ele está online
                const creatorOnline = config.creatorId ? Object.values(players).some(p => p.userId === config.creatorId && p.room === room) : false;
                
                if (!config.creatorId || (!creatorOnline && playersCurrentlyInRoom.length === 0)) {
                    // Não há criador OU criador não está online E é o primeiro a entrar
                    console.log(`[Backend Log - ADMIN ASSIGN] Sala ${room}: Sem criador ativo. ${nickname} (${userId}) é o NOVO CRIADOR.`);
                    config.creatorId = userId;
                    isCreator = true;
                    await saveRoomConfigToFirestore(room, config);
                } else {
                    // Há criador definido e ativo
                    isCreator = userId === config.creatorId;
                    console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) ${isCreator ? 'É o CRIADOR' : 'NÃO é criador'} da sala ${room}. Criador atual: ${config.creatorId}`);
                }
                
                isSaved = config.isSaved || false;
            }

            roomConfigs[room] = config;

            // Cancelar timer de desconexão se for admin reconectando
            if (isCreator && playerDisconnectionTimers[userId]) {
                clearTimeout(playerDisconnectionTimers[userId]);
                delete playerDisconnectionTimers[userId];
                console.log(`[Socket.io] Admin ${userId} reconectou. Timer de desconexão cancelado.`);
            }

            // Adicionar jogador à memória
            players[userId] = {
                userId,
                nickname,
                room,
                socketId: socket.id,
                isCreator
            };

            // Atualizar lista de players na config
            const playersInRoomUpdated = Object.values(players).filter(p => p.room === room);
            config.players = playersInRoomUpdated.map(p => ({
                userId: p.userId,
                nickname: p.nickname,
                isCreator: p.isCreator
            }));

            await saveRoomConfigToFirestore(room, config);

            console.log(`[Backend Log - join_room] ✅ ${nickname} (${userId}) entrou na sala ${room}. É CRIADOR: ${isCreator ? 'SIM' : 'NÃO'}. Total de jogadores: ${playersInRoomUpdated.length}`);

            // Emitir eventos
            socket.emit('room_joined', {
                room,
                player: {
                    userId,
                    nickname,
                    isCreator
                },
                players: config.players,
                config: {
                    themes: config.themes,
                    duration: config.duration,
                    creatorId: config.creatorId
                },
                roundStarted: config.roundActive || false,
                roundEnded: config.roundEnded || false,
                letter: config.currentLetter,
                stopClickedByMe: config.stopClickedByMe === userId,
                isSaved: isSaved
            });

            io.to(room).emit('players_update', config.players);
            emitRoomConfig(room, config);

        } catch (error) {
            console.error('[Socket.io] Error joining room:', error);
            socket.emit('room_error', { message: error.message });
        }
    });

    // REJOIN ROOM - Corrigido
    socket.on('rejoin_room', async ({ roomId, nickname, userId }) => {
        try {
            console.log(`[Backend Log - rejoin_room] Tentativa de reingresso: userId=${userId}, roomId=${roomId}, nickname=${nickname}`);

            const config = await getRoomConfigFromFirestore(roomId);
            if (!config) {
                console.log(`[Backend Log - rejoin_room] Sala ${roomId} não encontrada no Firestore.`);
                socket.emit('rejoin_room_fail');
                return;
            }

            console.log(`[Backend Log - rejoin_room] Sala ${roomId} encontrada no Firestore. creatorId: ${config.creatorId}`);

            socket.userId = userId;
            socket.room = roomId;
            socket.join(roomId);

            // Reset estados para salas salvas
            if (config.isSaved) {
                console.log(`[Backend Log - rejoin_room] Resetando estado de rodada para sala salva ${roomId}.`);
                config.roundActive = false;
                config.roundEnded = false;
                config.currentLetter = null;
                config.stopClickedByMe = null;
            }

            roomConfigs[roomId] = config;
            initializeRoomState(roomId);

            // Verificar quantos jogadores já estão na sala EM MEMÓRIA  
            const playersCurrentlyInRoom = Object.values(players).filter(p => p.room === roomId);
            console.log(`[Backend Log - rejoin_room] Jogadores já na sala ${roomId} em memória:`, playersCurrentlyInRoom.length);

            // Determinar se é criador
            let isCreator = userId === config.creatorId;

            // Se não há criador OU é o primeiro a entrar na sala
            if (!config.creatorId || playersCurrentlyInRoom.length === 0) {
                console.log(`[Backend Log - ADMIN ASSIGN] Rejoin: Sala ${roomId} sem criador ativo. ${nickname} (${userId}) é o NOVO CRIADOR.`);
                config.creatorId = userId;
                isCreator = true;
                await saveRoomConfigToFirestore(roomId, config);
            } else {
                console.log(`[Backend Log - ADMIN ASSIGN] Rejoin: ${nickname} (${userId}) ${isCreator ? 'É o CRIADOR' : 'NÃO é criador'} da sala ${roomId}. Criador: ${config.creatorId}.`);
            }

            // Cancelar timer de desconexão se for admin
            if (isCreator && playerDisconnectionTimers[userId]) {
                clearTimeout(playerDisconnectionTimers[userId]);
                delete playerDisconnectionTimers[userId];
            }

            // Adicionar/restaurar jogador
            players[userId] = {
                userId,
                nickname,
                room: roomId,
                socketId: socket.id,
                isCreator
            };

            // Atualizar lista de players
            const playersInRoomUpdated = Object.values(players).filter(p => p.room === roomId);
            config.players = playersInRoomUpdated.map(p => ({
                userId: p.userId,
                nickname: p.nickname,
                isCreator: p.isCreator
            }));

            await saveRoomConfigToFirestore(roomId, config);

            console.log(`[Backend Log - rejoin_room] ✅ ${nickname} (${userId}) reingressou na sala ${roomId}. É CRIADOR: ${isCreator ? 'SIM' : 'NÃO'}. Total: ${playersInRoomUpdated.length}`);

            socket.emit('rejoin_room_success', {
                room: {
                    roomId,
                    players: config.players,
                    config: {
                        themes: config.themes,
                        duration: config.duration,
                        creatorId: config.creatorId
                    },
                    roundStarted: config.roundActive || false,
                    roundEnded: config.roundEnded || false,
                    currentLetter: config.currentLetter,
                    stopClickedByMe: config.stopClickedByMe === userId,
                    isSaved: config.isSaved || false
                },
                player: {
                    nickname,
                    isCreator
                }
            });

            io.to(roomId).emit('players_update', config.players);
            emitRoomConfig(roomId, config);

        } catch (error) {
            console.error('[Socket.io] Error rejoining room:', error);
            socket.emit('rejoin_room_fail');
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

    socket.on('start_round', async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                throw new Error("Unauthorized start_round attempt");
            }

            if (config.roundActive || config.roundEnded) {
                throw new Error("Round already active or ended");
            }

            console.log(`[Socket.io] Starting countdown for room ${room}`);

            // Emitir countdown
            io.to(room).emit('round_start_countdown', { initialCountdown: 3 });

        } catch (error) {
            console.error('[Socket.io] Error starting round:', error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('start_game_actual', async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config) {
                throw new Error("Room config not found");
            }

            const letter = gameUtils.generateRandomLetter();
            config.roundActive = true;
            config.roundEnded = false;
            config.currentLetter = letter;
            config.stopClickedByMe = null;

            initializeRoomState(room);

            await saveRoomConfigToFirestore(room, config);

            io.to(room).emit('round_started', { letter });
            emitRoomConfig(room, config);

            console.log(`[Socket.io] Round started for room ${room} with letter ${letter}`);

        } catch (error) {
            console.error('[Socket.io] Error in start_game_actual:', error);
        }
    });

    socket.on('submit_answers', async ({ room, answers }) => {
        try {
            console.log(`[Socket.io] Submit answers received from ${socket.userId} for room ${room}`);
            
            if (!gameState.has(room)) {
                initializeRoomState(room);
            }

            const state = gameState.get(room);
            state.answers.set(socket.userId, {
                id: socket.userId,
                nickname: players[socket.userId]?.nickname || "Unknown",
                answers: answers.map(a => ({
                    theme: a.theme,
                    answer: a.answer || "",
                    points: null,
                    validated: false
                }))
            });

            console.log(`[Socket.io] Answers saved for player ${socket.userId} in room ${room}`);
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
                throw new Error("Round not active");
            }

            // Update room state
            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = socket.userId;

            // Set validator
            if (!gameState.has(room)) {
                initializeRoomState(room);
            }
            gameState.get(room).validatorId = socket.userId;

            await saveRoomConfigToFirestore(room, config);

            io.to(room).emit("round_ended");
            emitRoomConfig(room, config);

            // Start validation after delay
            setTimeout(() => startValidation(room), 1500);
        } catch (error) {
            console.error('[Socket.io] Error in stop_round:', error);
            socket.emit("error", { message: error.message });
        }
    });

    socket.on('reveal', ({ room }) => {
        console.log(`[Socket.io] Reveal requested for room ${room}`);
        io.to(room).emit('reveal');
    });

    // VALIDATE ANSWER - Movido para dentro do escopo do socket connection
    socket.on("validate_answer", ({ valid, room }) => {
        try {
            const roomState = gameState.get(room);
            if (!roomState) {
                throw new Error("Room state not found");
            }

            if (roomState.validatorId !== socket.userId) {
                console.log('[Validation] Auth failed:', {
                    attemptingUserId: socket.userId,
                    validatorId: roomState.validatorId
                });
                throw new Error("Unauthorized validation attempt");
            }

            const validation = roomState.currentValidation;
            if (!validation) {
                throw new Error("No active validation");
            }

            const config = roomConfigs[room];
            const currentPlayer = validation.answers[validation.currentPlayerIndex];
            const currentThemeIndex = validation.currentThemeIndex;
            
            if (!currentPlayer || !currentPlayer.answers[currentThemeIndex]) {
                throw new Error("Invalid player or answer index");
            }

            // Marcar resposta como validada
            currentPlayer.answers[currentThemeIndex].validated = true;
            currentPlayer.answers[currentThemeIndex].judgeValidation = valid; // Salvar decisão do juiz

            console.log(`[Validation] Answer judged: ${valid ? 'VALID' : 'INVALID'} - Player: ${currentPlayer.nickname}, Theme: ${config.themes[currentThemeIndex]}`);

            // Próximo jogador no mesmo tema
            validation.currentPlayerIndex++;
            
            // Se validamos todos os jogadores no tema atual
            if (validation.currentPlayerIndex >= validation.answers.length) {
                // Aplicar sistema de pontuação para o tema atual
                applyScoring(validation.answers, currentThemeIndex);
                
                // Resetar para o primeiro jogador
                validation.currentPlayerIndex = 0;
                // Próximo tema
                validation.currentThemeIndex++;
                
                // Se terminamos todos os temas, finalizar validação
                if (validation.currentThemeIndex >= config.themes.length) {
                    console.log(`[Validation] All themes completed! Finalizing validation for room ${room}`);
                    
                    // Calcular pontuações finais
                    validation.answers.forEach(player => {
                        const roundScore = player.answers.reduce((sum, a) => sum + (a.points || 0), 0);
                        
                        console.log(`[Validation] Processing player ${player.nickname} (${player.id}) with score ${roundScore}`);
                        
                        // CORRIGIDO: Buscar socket pela room e userId
                        const playerSockets = Array.from(io.sockets.sockets.values()).filter(s => 
                            s.room === room && s.userId === player.id
                        );
                        
                        console.log(`[Validation] Found ${playerSockets.length} socket(s) for player ${player.id}`);
                        
                        if (playerSockets.length > 0) {
                            playerSockets.forEach(targetSocket => {
                                targetSocket.emit("validation_complete", { 
                                    myScore: roundScore,
                                    myAnswers: player.answers
                                });
                                console.log(`[Validation] ✅ Sent individual results to ${player.nickname}: ${roundScore} points`);
                            });
                        } else {
                            console.warn(`[Validation] ⚠️ No socket found for player ${player.nickname} (${player.id})`);
                            
                            // Fallback: emitir para toda a sala com filtro no frontend
                            io.to(room).emit("validation_complete_for_player", {
                                playerId: player.id,
                                myScore: roundScore,
                                myAnswers: player.answers
                            });
                        }
                    });
                    
                    // Limpar validação
                    roomState.currentValidation = null;
                    console.log(`[Validation] Validation completed for room ${room}`);
                    return;
                }
            }

            // Emitir próxima resposta para validação
            const nextPlayer = validation.answers[validation.currentPlayerIndex];
            const nextTheme = config.themes[validation.currentThemeIndex];
            
            console.log(`[Validation] Next validation: ${nextPlayer.nickname} - ${nextTheme}`);
            
            io.to(room).emit("answer_validated", {
                current: {
                    playerId: nextPlayer.id,
                    playerNickname: nextPlayer.nickname,
                    themeIndex: validation.currentThemeIndex,
                    theme: nextTheme,
                    answer: nextPlayer.answers[validation.currentThemeIndex]?.answer || "",
                    validated: false,
                    totalPlayers: validation.answers.length,
                    currentPlayerIndex: validation.currentPlayerIndex,
                    totalThemes: config.themes.length,
                    isLastAnswerOfTheme: validation.currentPlayerIndex === validation.answers.length - 1,
                    isLastAnswerOfGame: validation.currentThemeIndex === config.themes.length - 1 && validation.currentPlayerIndex === validation.answers.length - 1
                }
            });

        } catch (error) {
            console.error('[Validation] Error in validate_answer:', error);
            socket.emit("error", { 
                message: "Erro na validação",
                details: error.message 
            });
        }
    });

    socket.on("new_round", async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                throw new Error("Unauthorized new_round attempt");
            }

            console.log(`[Socket.io] Starting new round for room ${room}`);

            // Resetar estados da sala
            initializeRoomState(room);
            config.roundActive = false;
            config.roundEnded = false;
            config.currentLetter = null;
            config.stopClickedByMe = null;

            await saveRoomConfigToFirestore(room, config);
            emitRoomConfig(room, config);

            // Notificar todos os jogadores
            io.to(room).emit("new_round_started");

        } catch (error) {
            console.error('[Socket.io] Error starting new round:', error);
            socket.emit("error", { message: error.message });
        }
    });

    socket.on("end_game", ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log('[Socket.io] Unauthorized end_game attempt');
                return;
            }

            console.log(`[Socket.io] Ending game for room ${room}`);

            // Calcular ranking final
            const playersInRoom = Object.values(players).filter(p => p.room === room);
            const finalRanking = playersInRoom.map(player => ({
                playerId: player.userId,
                nickname: player.nickname,
                totalScore: roomOverallScores[room]?.[player.userId] || 0
            }));

            // Emitir ranking final
            io.to(room).emit("game_ended", finalRanking);

            // Limpar estados do jogo
            gameState.delete(room);
            delete stopCallers[room];
            delete validationStates[room];
            delete roomOverallScores[room];

            // Resetar configuração da sala
            config.roundActive = false;
            config.roundEnded = false;
            config.currentLetter = null;
            config.stopClickedByMe = null;
            
            saveRoomConfigToFirestore(room, config);
            emitRoomConfig(room, config);

        } catch (error) {
            console.error('[Socket.io] Error ending game:', error);
        }
    });

    socket.on('leave_room', () => {
        try {
            const userId = socket.userId;
            const room = socket.room;

            if (userId && players[userId]) {
                console.log(`[Socket.io] Player ${userId} leaving room ${room}`);
                
                delete players[userId];
                socket.leave(room);

                // Atualizar lista de jogadores na sala
                if (roomConfigs[room]) {
                    const playersInRoom = Object.values(players).filter(p => p.room === room);
                    roomConfigs[room].players = playersInRoom.map(p => ({
                        userId: p.userId,
                        nickname: p.nickname,
                        isCreator: p.isCreator
                    }));

                    // Se o admin saiu, promover outro jogador
                    if (roomConfigs[room].creatorId === userId && playersInRoom.length > 0) {
                        const newAdmin = playersInRoom[0];
                        roomConfigs[room].creatorId = newAdmin.userId;
                        newAdmin.isCreator = true;
                        players[newAdmin.userId].isCreator = true;
                        
                        console.log(`[Socket.io] Novo admin designado para sala ${room}: ${newAdmin.nickname} (${newAdmin.userId})`);
                    }

                    io.to(room).emit('players_update', roomConfigs[room].players);
                    saveRoomConfigToFirestore(room, roomConfigs[room]);
                }
            }
        } catch (error) {
            console.error('[Socket.io] Error leaving room:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            const userId = socket.userId;
            const room = socket.room;

            if (userId && players[userId]) {
                console.log(`[Socket.io] Socket desconectado. Socket ID: ${socket.id}, userId: ${userId}, Sala: ${room}`);
                
                const player = players[userId];
                
                // Se for admin, aguardar antes de transferir poder
                if (player.isCreator && roomConfigs[room]) {
                    console.log(`[Socket.io] Admin ${userId} desconectou. Iniciando timer de 30s...`);
                    
                    playerDisconnectionTimers[userId] = setTimeout(() => {
                        console.log(`[Socket.io] Admin ${userId} não reconectou. Transferindo poder...`);
                        
                        const playersInRoom = Object.values(players).filter(p => p.room === room && p.userId !== userId);
                        
                        if (playersInRoom.length > 0) {
                            const newAdmin = playersInRoom[0];
                            roomConfigs[room].creatorId = newAdmin.userId;
                            newAdmin.isCreator = true;
                            players[newAdmin.userId].isCreator = true;
                            
                            console.log(`[Socket.io] Novo admin: ${newAdmin.nickname} (${newAdmin.userId}) na sala ${room}.`);
                            
                            roomConfigs[room].players = playersInRoom.map(p => ({
                                userId: p.userId,
                                nickname: p.nickname,
                                isCreator: p.isCreator
                            }));
                            
                            io.to(room).emit('players_update', roomConfigs[room].players);
                            emitRoomConfig(room, roomConfigs[room]);
                            saveRoomConfigToFirestore(room, roomConfigs[room]);
                        }
                        
                        delete players[userId];
                        delete playerDisconnectionTimers[userId];
                    }, 30000); // 30 segundos
                } else {
                    // Jogador normal - remover imediatamente
                    delete players[userId];
                    
                    if (roomConfigs[room]) {
                        const playersInRoom = Object.values(players).filter(p => p.room === room);
                        roomConfigs[room].players = playersInRoom.map(p => ({
                            userId: p.userId,
                            nickname: p.nickname,
                            isCreator: p.isCreator
                        }));
                        
                        io.to(room).emit('players_update', roomConfigs[room].players);
                        saveRoomConfigToFirestore(room, roomConfigs[room]);
                    }
                }
            }

            console.log(`[Socket.io] Conexão ${socket.id} desconectada`);
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

            // Usar o admin como juiz quando o tempo esgotar
            const adminPlayer = Object.values(players).find(p => p.room === room && p.isCreator);
            if (!adminPlayer) {
                console.log(`[Socket.io] No admin found in room ${room} for time up`);
                return;
            }

            // Update room state - mesmo comportamento do STOP
            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = 'TIME_UP'; // Indicar que foi por tempo

            // Set admin como validator
            if (!gameState.has(room)) {
                initializeRoomState(room);
            }
            gameState.get(room).validatorId = adminPlayer.userId;

            await saveRoomConfigToFirestore(room, config);

            // Emitir que o tempo acabou
            io.to(room).emit("time_up_round_ended");
            emitRoomConfig(room, config);

            // Start validation after delay
            setTimeout(() => startValidation(room), 1500);
            
            console.log(`[Socket.io] Time up processed for room ${room}, admin ${adminPlayer.nickname} is judge`);
        } catch (error) {
            console.error('[Socket.io] Error in time_up:', error);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
