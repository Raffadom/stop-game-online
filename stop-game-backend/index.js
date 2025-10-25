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
            
            // ✅ NÃO salvar automaticamente no Firestore
            // await saveRoomConfigToFirestore(room, config); // ❌ REMOVIDO
            
            console.log(`[Countdown] Round started for room ${room} with letter ${letter}`);
            io.to(room).emit("round_started", { letter });
            emitRoomConfig(room, config);
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

            let roomConfig = roomConfigs[roomId]; // ✅ Primeiro verificar memória local
            
            if (!roomConfig) {
                // ✅ Se não está na memória, verificar Firestore APENAS se for sala salva
                console.log(`[Backend Log - join_room] Sala ${roomId} não encontrada na memória, verificando Firestore...`);
                const savedRoomConfig = await getRoomConfigFromFirestore(roomId);
                
                if (savedRoomConfig && savedRoomConfig.isSaved) {
                    console.log(`[Backend Log - join_room] Sala salva ${roomId} encontrada no Firestore`);
                    roomConfig = savedRoomConfig;
                    
                    // ✅ Manter configuração salva (incluindo temas personalizados)
                    console.log(`[Backend Log - join_room] ✅ Mantendo temas salvos: [${roomConfig.themes.join(', ')}]`);
                    console.log(`[Backend Log - join_room] ✅ Duração salva: ${roomConfig.duration}s`);
                    console.log(`[Backend Log - join_room] ✅ Status da sala: ${roomConfig.isSaved ? 'SALVA' : 'TEMPORÁRIA'}`);
                    
                    // ✅ Resetar apenas estados de jogo (manter configurações)
                    roomConfig.roundActive = false;
                    roomConfig.roundEnded = false;
                    roomConfig.currentLetter = null;
                    roomConfig.isCountingDown = false;
                    roomConfig.gameEnded = false;
                    
                    // ✅ Limpar jogadores desconectados
                    const currentPlayers = roomConfig.players || {};
                    const validPlayers = {};
                    
                    Object.values(currentPlayers).forEach(player => {
                        if (connectedUserIds.includes(player.userId) || player.userId === userId) {
                            validPlayers[player.userId] = player;
                        }
                    });
                    
                    roomConfig.players = validPlayers;
                } else {
                    // ✅ Criar nova sala temporária com temas padrão
                    console.log(`[Backend Log - join_room] Criando nova sala temporária ${roomId}`);
                    roomConfig = {
                        themes: ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'],
                        duration: 60,
                        creatorId: null,
                        roundActive: false,
                        roundEnded: false,
                        currentLetter: null,
                        isSaved: false, // ✅ Sala temporária
                        isCountingDown: false,
                        createdAt: new Date(),
                        players: {}
                    };
                    
                    console.log(`[Backend Log - join_room] ✅ Nova sala criada com temas: [${roomConfig.themes.join(', ')}]`);
                }
            } else {
                console.log(`[Backend Log - join_room] Sala ${roomId} encontrada na memória local`);
                
                // ✅ CORREÇÃO: Não forçar temas padrão - manter temas atuais da sala
                console.log(`[Backend Log - join_room] ✅ Mantendo temas atuais: [${roomConfig.themes.join(', ')}]`);
                
                // ✅ Resetar apenas estados de jogo
                roomConfig.roundActive = false;
                roomConfig.roundEnded = false;
                roomConfig.currentLetter = null;
                roomConfig.isCountingDown = false;
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

            // ✅ Salvar APENAS na memória local (não no Firestore)
            roomConfigs[roomId] = roomConfig;

            const playersArray = Object.values(roomConfig.players).sort((a, b) => {
                if (a.isCreator && !b.isCreator) return -1;
                if (!a.isCreator && b.isCreator) return 1;
                return new Date(a.joinedAt) - new Date(b.joinedAt);
            });

            console.log(`[Backend Log - join_room] ✅ ${nickname} entrou na sala ${roomId}. É ADMIN: ${isCreator ? 'SIM' : 'NÃO'}. Total: ${playersArray.length}. Sala salva: ${roomConfig.isSaved ? 'SIM' : 'NÃO'}`);
            console.log(`[Backend Log - join_room] ✅ Temas finais da sala: [${roomConfig.themes.join(', ')}] - Duração: ${roomConfig.duration}s`);

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

            // ✅ CORREÇÃO: Permitir alterações em salas salvas, mas marcar como não salva
            if (themes && Array.isArray(themes) && themes.length > 0) {
                const validThemes = themes.filter(theme => 
                    typeof theme === 'string' && theme.trim().length > 0
                ).map(theme => theme.trim());
                
                if (validThemes.length > 0) {
                    console.log(`[Socket.io] Atualizando temas da sala ${room}:`);
                    console.log(`[Socket.io] Antes: [${config.themes.join(', ')}]`);
                    console.log(`[Socket.io] Depois: [${validThemes.join(', ')}]`);
                    
                    config.themes = validThemes;
                    config.isSaved = false; // ✅ Marcar como não salva após alteração
                    
                    io.to(room).emit('themes_updated', { themes: config.themes });
                    emitRoomConfig(room, config);
                    
                    console.log(`[Socket.io] ✅ Temas atualizados para sala ${room} - Status: NÃO SALVA`);
                } else {
                    console.log(`[Socket.io] No valid themes provided for room ${room}`);
                }
            } else {
                console.log(`[Socket.io] Invalid themes data for room ${room}:`, themes);
            }

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
            
            config.isSaved = false; // ✅ Marcar como não salva após alteração

            // ✅ NÃO salvar automaticamente no Firestore
            // await saveRoomConfigToFirestore(room, config); // ❌ REMOVIDO
            emitRoomConfig(room, config);

            console.log(`[Socket.io] Config updated for room ${room} (não salvo no Firestore)`);

        } catch (error) {
            console.error('[Socket.io] Error updating config:', error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('save_room', async ({ room, roomName, duration }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized save attempt by ${socket.userId}`);
                return;
            }

            console.log(`[Socket.io] Salvando sala ${room} no Firestore...`);

            const roomData = {
                name: roomName || room,
                themes: config.themes || [],
                duration: duration || config.duration || 60, // ✅ Usar duração fornecida
                createdBy: socket.userId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                isActive: true
            };

            await db.collection('saved_rooms').doc(room).set(roomData);
            
            // ✅ Atualizar config com nova duração
            if (duration) {
                config.duration = duration;
            }
            
            // ✅ Marcar como salva
            config.isSaved = true;
            
            console.log(`[Socket.io] ✅ Sala ${room} salva com sucesso!`);
            
            // ✅ Emitir confirmação de salvamento
            socket.emit('room_saved_success');
            emitRoomConfig(room, config);

        } catch (error) {
            console.error('[Socket.io] Error saving room:', error);
            socket.emit('room_save_error', { message: 'Erro ao salvar sala' });
        }
    });

    // ✅ Remover salvamento automático de TODOS os outros eventos
    socket.on('start_round', async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized start_round attempt by ${socket.userId} in room ${room}`);
                return;
            }

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
            console.log(`[Socket.io] 📝 Respostas recebidas de ${socket.nickname || socket.userId}:`, answers);
            
            // ✅ Salvar respostas no socket do jogador
            socket.submittedAnswers = answers;
            
            // ✅ Confirmar recebimento
            socket.emit('answers_received');
            
            console.log(`[Socket.io] ✅ Respostas salvas para ${socket.nickname || socket.userId}`);
            
        } catch (error) {
            console.error('[Socket.io] Error handling submit_answers:', error);
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
                return;
            }

            // ✅ CORREÇÃO: Quem clica STOP é o validador (não o admin)
            const validatorId = socket.userId; // ✅ Quem clicou STOP será o validador

            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = socket.userId;

            console.log(`[Socket.io] 🎯 Validador definido após STOP: ${validatorId} (quem clicou STOP)`);

            // ✅ Emitir evento de rodada finalizada (igual ao time_up)
            io.to(room).emit('time_up_round_ended', { validatorId }); // ✅ Usar o mesmo evento

            console.log(`[Socket.io] ✅ Evento 'time_up_round_ended' enviado para sala ${room}`);
            emitRoomConfig(room, config);

            console.log(`[Socket.io] Round ended for room ${room}, ${socket.nickname} is validator`);

            // ✅ CORREÇÃO: Usar startValidationProcess (igual ao time_up)
            setTimeout(() => {
                console.log(`[Socket.io] 🔄 Iniciando validação após STOP na sala ${room}...`);
                startValidationProcess(room, validatorId); // ✅ USAR O MESMO SISTEMA DO TIME_UP
            }, 2000);

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
            
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized new_round attempt by ${socket.userId} in room ${room}`);
                return;
            }

            if (resetLetters) {
                clearRoomLetters(room);
            }

            config.roundActive = false;
            config.roundEnded = false;
            config.stopClickedByMe = false;
            config.currentLetter = null;
            config.isCountingDown = false;
            config.gameEnded = false;
            
            if (gameState.has(room)) {
                const roomState = gameState.get(room);
                roomState.answers.clear();
                roomState.currentValidation = null;
            }

            // ✅ NÃO salvar automaticamente no Firestore
            // await saveRoomConfigToFirestore(room, config); // ❌ REMOVIDO

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
            
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized end_game attempt by ${socket.userId} in room ${room}`);
                return;
            }
            
            if (config.gameEnded) {
                console.log(`[Socket.io] Game already ended for room ${room}`);
                return;
            }
            
            config.gameEnded = true;
            config.roundActive = false;
            config.roundEnded = false;
            config.isCountingDown = false;
            
            // ✅ NÃO salvar automaticamente no Firestore
            // await saveRoomConfigToFirestore(room, config); // ❌ REMOVIDO
            
            console.log(`[Socket.io] Game ended for room ${room}`);
            
            const roomState = gameState.get(room);
            const ranking = [];
            
            if (roomState && roomState.playerScores) {
                for (const [playerId, totalScore] of roomState.playerScores.entries()) {
                    const playerConfig = config.players[playerId];
                    if (playerConfig) {
                        ranking.push({
                            userId: playerId,
                            nickname: playerConfig.nickname,
                            score: totalScore
                        });
                    }
                }
            }
            
            ranking.sort((a, b) => b.score - a.score);
            
            io.to(room).emit('game_ended', { ranking });
            
        } catch (error) {
            console.error('[Socket.io] Error ending game:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            const roomId = socket.room;
            const userId = socket.userId;
            
            console.log(`[Socket.io] Desconexão: ${socket.id} (userId: ${userId}, roomId: ${roomId})`);
            
            if (roomId && userId) {
                const config = roomConfigs[roomId];
                if (config && config.players) {
                    delete config.players[userId];
                    console.log(`[Socket.io] Jogador ${userId} removido da sala ${roomId}`);
                    
                    // ✅ NÃO salvar automaticamente no Firestore
                    // await saveRoomConfigToFirestore(roomId, config); // ❌ REMOVIDO

                    const playersArray = Object.values(config.players);
                    io.to(roomId).emit('players_update', playersArray);
                    emitRoomConfig(roomId, config);
                }
            }
        } catch (error) {
            console.error('[Socket.io] Error on disconnect:', error);
        }
    });

    socket.on('get_room_config', async ({ room }) => {
        try {
            console.log(`[Socket.io] get_room_config solicitado para sala: ${room}`);
            
            let config = roomConfigs[room];
            
            // ✅ Se não está na memória, tentar recuperar do Firestore
            if (!config) {
                console.log(`[Socket.io] Sala ${room} não encontrada na memória, verificando Firestore...`);
                const savedConfig = await getRoomConfigFromFirestore(room);
                
                if (savedConfig && savedConfig.isSaved) {
                    console.log(`[Socket.io] Configuração salva recuperada do Firestore para sala ${room}`);
                    config = savedConfig;
                    // ✅ Adicionar na memória para próximas consultas
                    roomConfigs[room] = config;
                }
            }
            
            if (config) {
                console.log(`[Socket.io] Enviando configuração da sala ${room}:`, {
                    themes: config.themes,
                    duration: config.duration,
                    isSaved: config.isSaved
                });
                
                socket.emit('room_config', {
                    themes: config.themes || ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'],
                    duration: config.duration || 60,
                    roundActive: config.roundActive || false,
                    roundEnded: config.roundEnded || false,
                    currentLetter: config.currentLetter || null,
                    isSaved: config.isSaved || false, // ✅ Manter o status correto
                    creatorId: config.creatorId || null
                });
            } else {
                console.log(`[Socket.io] Sala ${room} não encontrada, enviando configuração padrão`);
                socket.emit('room_config', {
                    themes: ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'],
                    duration: 60,
                    roundActive: false,
                    roundEnded: false,
                    currentLetter: null,
                    isSaved: false,
                    creatorId: null
                });
            }
        } catch (error) {
            console.error('[Socket.io] Error in get_room_config:', error);
            socket.emit('room_config', {
                themes: ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'],
                duration: 60,
                roundActive: false,
                roundEnded: false,
                currentLetter: null,
                isSaved: false,
                creatorId: null
            });
        }
    });

    socket.on('update_duration', async ({ room, duration }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized duration update attempt by ${socket.userId}`);
                return;
            }

            if (typeof duration === 'number' && duration > 0) {
                console.log(`[Socket.io] Atualizando duração da sala ${room}: ${config.duration}s → ${duration}s`);
                
                config.duration = duration;
                config.isSaved = false; // ✅ Marcar como não salva após alteração
                
                io.to(room).emit('duration_updated', { duration });
                emitRoomConfig(room, config);
                
                console.log(`[Socket.io] ✅ Duração atualizada para sala ${room} - Status: NÃO SALVA`);
            } else {
                console.log(`[Socket.io] Invalid duration for room ${room}:`, duration);
            }

        } catch (error) {
            console.error('[Socket.io] Error updating duration:', error);
        }
    });

    // ✅ CORRIGIR: Handler para quando tempo se esgota
    socket.on('time_up', ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config) {
                console.log(`[Socket.io] ❌ Room ${room} not found for time_up`);
                return;
            }

            console.log(`[Socket.io] ⏰ Tempo esgotado na sala ${room}`);

            // ✅ Marcar rodada como finalizada
            config.roundActive = false;
            config.roundEnded = true;

            // ✅ Definir quem será o validador (Admin quando tempo esgota)
            let validatorId = config.creatorId; // ✅ CORRIGIR: usar 'validatorId' (inglês)

            console.log(`[Socket.io] 🎯 Validador definido: ${validatorId} (Admin)`);

            // ✅ Emitir evento de rodada finalizada
            io.to(room).emit('time_up_round_ended', { validatorId });

            console.log(`[Socket.io] ✅ Evento 'time_up_round_ended' enviado para sala ${room}`);

            // ✅ Aguardar um pouco e iniciar validação automaticamente
            setTimeout(() => {
                console.log(`[Socket.io] 🔄 Iniciando validação automática para sala ${room}...`);
                startValidationProcess(room, validatorId); // ✅ CORRIGIR: passar 'validatorId'
            }, 2000); // ✅ 2 segundos para garantir que respostas sejam enviadas

        } catch (error) {
            console.error('[Socket.io] ❌ Error handling time_up:', error);
        }
    });

    // ✅ SUBSTITUIR COMPLETAMENTE: startValidationProcess
    function startValidationProcess(room, validatorId) { // ✅ CORRIGIR: parâmetro 'validatorId'
        try {
            const config = roomConfigs[room];
            if (!config) {
                console.log(`[Socket.io] ❌ Room ${room} not found for validation`);
                return;
            }

            console.log(`[Socket.io] 🔍 === INICIANDO PROCESSO DE VALIDAÇÃO ===`);
            console.log(`[Socket.io] 📍 Sala: ${room}`);
            console.log(`[Socket.io] 👤 Validador: ${validatorId}`); // ✅ CORRIGIR: usar 'validatorId'

            // ✅ Coletar todas as respostas submetidas
            const allAnswers = [];
            const roomSockets = io.sockets.adapter.rooms.get(room);
            
            console.log(`[Socket.io] 👥 Sockets na sala:`, roomSockets ? Array.from(roomSockets) : 'Nenhum');

            if (roomSockets) {
                for (const playerId of roomSockets) {
                    const playerSocket = io.sockets.sockets.get(playerId);
                    if (playerSocket && playerSocket.submittedAnswers) {
                        console.log(`[Socket.io] 🔍 === VERIFICANDO JOGADOR ${playerSocket.nickname || playerId} ===`);
                        console.log(`[Socket.io] 📋 submittedAnswers:`, playerSocket.submittedAnswers);
                        
                        allAnswers.push({
                            playerId,
                            playerNickname: playerSocket.nickname || `Player${playerId.slice(-4)}`,
                            answers: playerSocket.submittedAnswers
                        });
                        console.log(`[Socket.io] ✅ Respostas coletadas de ${playerSocket.nickname || playerId}`);
                    }
                }
            }

            console.log(`[Socket.io] 📊 === RESUMO DE COLETA ===`);
            console.log(`[Socket.io] 📊 Total de jogadores com respostas: ${allAnswers.length}`);

            if (allAnswers.length === 0) {
                console.log(`[Socket.io] ❌ Nenhuma resposta para validar`);
                io.to(room).emit('no_answers_to_validate');
                return;
            }

            // ✅ CORREÇÃO PRINCIPAL: Criar fila POR TEMA (não por jogador)
            config.validationQueue = [];
            config.currentValidation = 0;
            config.validatorId = validatorId;
            config.playersAnswers = {};

            console.log(`[Socket.io] 🔧 Preparando fila de validação POR TEMA...`);

            // ✅ Inicializar estrutura de respostas dos jogadores
            allAnswers.forEach(playerData => {
                config.playersAnswers[playerData.playerId] = {
                    nickname: playerData.playerNickname,
                    answers: {}
                };
            });

            // ✅ NOVA LÓGICA: Agrupar por TEMA primeiro
            const themes = config.themes || ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal', 'Objeto', 'Fruta'];
            
            themes.forEach((theme, themeIndex) => {
                console.log(`[Socket.io] 📝 === PROCESSANDO TEMA: ${theme} ===`);
                
                allAnswers.forEach(playerData => {
                    // ✅ Encontrar resposta deste jogador para este tema
                    const playerAnswer = playerData.answers.find(answer => answer.theme === theme);
                    const answerText = playerAnswer ? playerAnswer.answer : "";
                    
                    console.log(`[Socket.io] 🎯 ${playerData.playerNickname} - ${theme}: "${answerText}"`);
                    
                    // ✅ Adicionar na fila de validação
                    config.validationQueue.push({
                        playerId: playerData.playerId,
                        playerNickname: playerData.playerNickname,
                        theme: theme,
                        answer: answerText
                    });

                    // ✅ Inicializar na estrutura de respostas
                    config.playersAnswers[playerData.playerId].answers[theme] = {
                        answer: answerText,
                        points: null, // ✅ null = ainda não validado
                        reason: "Aguardando validação",
                        valid: null
                    };
                });
            });

            console.log(`[Socket.io] 📋 === FILA DE VALIDAÇÃO CRIADA (POR TEMA) ===`);
            console.log(`[Socket.io] 📋 Total de itens na fila: ${config.validationQueue.length}`);
            
            // ✅ Log da nova ordem (por tema)
            config.validationQueue.slice(0, 8).forEach((item, i) => {
                console.log(`[Socket.io] Fila[${i}]: ${item.playerNickname} - ${item.theme} - "${item.answer}"`);
            });

            // ✅ Iniciar primeira validação
            console.log(`[Socket.io] 🚀 Iniciando primeira validação em 1 segundo...`);
            setTimeout(() => {
                processNextValidation(room);
            }, 1000);

        } catch (error) {
            console.error('[Socket.io] ❌ Error starting validation process:', error);
        }
    }

    // ✅ ADICIONAR: processNextValidation
    function processNextValidation(room) {
        try {
            const config = roomConfigs[room];
            if (!config || !config.validationQueue) {
                console.log(`[Socket.io] ❌ No validation queue for room ${room}`);
                return;
            }

            console.log(`[Socket.io] 🔍 processNextValidation - Atual: ${config.currentValidation}/${config.validationQueue.length}`);

            if (config.currentValidation >= config.validationQueue.length) {
                console.log(`[Socket.io] ✅ Validação completa para sala ${room}`);
                completeValidation(room);
                return;
            }

            const currentItem = config.validationQueue[config.currentValidation];
            console.log(`[Socket.io] 🎯 Validando item ${config.currentValidation + 1}/${config.validationQueue.length}:`);
            console.log(`[Socket.io] 👤 Jogador: ${currentItem.playerNickname}`);
            console.log(`[Socket.io] 📋 Tema: ${currentItem.theme}`);
            console.log(`[Socket.io] 💭 Resposta: "${currentItem.answer}"`);

            // ✅ Buscar validador
            let validatorSocket = null;
            validatorSocket = io.sockets.sockets.get(config.validatorId);
            
            if (!validatorSocket) {
                console.log(`[Socket.io] ❌ Validador não encontrado por ID direto: ${config.validatorId}`);
                
                const roomSockets = io.sockets.adapter.rooms.get(room);
                if (roomSockets) {
                    for (const socketId of roomSockets) {
                        const socket = io.sockets.sockets.get(socketId);
                        if (socket && socket.userId === config.validatorId) {
                            validatorSocket = socket;
                            console.log(`[Socket.io] ✅ Validador encontrado na sala por userId: ${socket.nickname || socketId}`);
                            break;
                        }
                    }
                }
            }

            if (!validatorSocket) {
                console.log(`[Socket.io] ❌ Validador não encontrado - pulando validação`);
                config.currentValidation++;
                setTimeout(() => processNextValidation(room), 100);
                return;
            }

            console.log(`[Socket.io] ✅ Validador encontrado: ${validatorSocket.nickname || validatorSocket.userId}`);

            // ✅ Emitir para o validador
            console.log(`[Socket.io] 📤 Enviando start_validation para ${validatorSocket.nickname || config.validatorId}`);
            
            const validationData = {
                playerId: currentItem.playerId,
                playerNickname: currentItem.playerNickname,
                theme: currentItem.theme,
                answer: currentItem.answer,
                currentIndex: config.currentValidation + 1,
                totalItems: config.validationQueue.length
            };

            console.log(`[Socket.io] 📦 Dados da validação:`, validationData);
            
            validatorSocket.emit('start_validation', validationData);
            
            console.log(`[Socket.io] ✅ start_validation enviado com sucesso`);

        } catch (error) {
            console.error('[Socket.io] ❌ Error processing next validation:', error);
        }
    }

    // ✅ ADICIONAR: normalizeAnswer function
    function normalizeAnswer(answer) {
        if (!answer || typeof answer !== 'string') return '';
        
        return answer
            .toLowerCase()
            .trim()
            .replace(/[áàâãäåæ]/g, 'a')
            .replace(/[éèêë]/g, 'e')
            .replace(/[íìîï]/g, 'i')
            .replace(/[óòôõöø]/g, 'o')
            .replace(/[úùûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[ñ]/g, 'n')
            .replace(/[^a-z0-9]/g, ''); // Remove acentos e caracteres especiais
    }

    // ✅ SUBSTITUIR: Handler de validação
    socket.on('validate_answer', ({ valid, room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || !config.validationQueue || socket.userId !== config.validatorId) {
                console.log(`[Socket.io] Unauthorized validation attempt by ${socket.userId}`);
                return;
            }

            const currentItem = config.validationQueue[config.currentValidation];
            if (!currentItem) {
                console.log(`[Socket.io] No current validation item for room ${room}`);
                return;
            }

            console.log(`[Socket.io] ✅ Resposta validada:`, {
                player: currentItem.playerNickname,
                theme: currentItem.theme,
                answer: currentItem.answer,
                valid
            });

            // ✅ IMPORTANTE: Salvar resultado da validação (sem calcular pontos ainda)
            if (config.playersAnswers[currentItem.playerId] && config.playersAnswers[currentItem.playerId].answers[currentItem.theme]) {
                config.playersAnswers[currentItem.playerId].answers[currentItem.theme].valid = valid;
                config.playersAnswers[currentItem.playerId].answers[currentItem.theme].reason = valid ? "Resposta válida" : "Resposta inválida";
            }

            // ✅ Emitir confirmação
            socket.emit('answer_validated', {
                theme: currentItem.theme,
                valid
            });

            // ✅ Avançar para próxima validação
            config.currentValidation++;
            
            setTimeout(() => {
                processNextValidation(room);
            }, 500);

        } catch (error) {
            console.error('[Socket.io] Error validating answer:', error);
        }
    });

    // ✅ ADICIONAR: Função para completar validação COM detecção de duplicatas
    function completeValidation(room) {
        try {
            const config = roomConfigs[room];
            if (!config || !config.playersAnswers) {
                console.log(`[Socket.io] No players answers for room ${room}`);
                return;
            }

            console.log(`[Socket.io] 🏁 Completando validação para sala ${room}`);

            // ✅ CORREÇÃO PRINCIPAL: Calcular pontos com detecção de duplicatas
            const themes = config.themes || ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal', 'Objeto', 'Fruta'];
            
            themes.forEach(theme => {
                console.log(`[Socket.io] 🎯 Calculando pontos para tema: ${theme}`);
                
                // ✅ Coletar todas as respostas válidas para este tema
                const validAnswersForTheme = [];
                
                Object.keys(config.playersAnswers).forEach(playerId => {
                    const playerAnswer = config.playersAnswers[playerId].answers[theme];
                    if (playerAnswer && playerAnswer.valid && playerAnswer.answer && playerAnswer.answer.trim()) {
                        validAnswersForTheme.push({
                            playerId,
                            playerNickname: config.playersAnswers[playerId].nickname,
                            originalAnswer: playerAnswer.answer,
                            normalizedAnswer: normalizeAnswer(playerAnswer.answer)
                        });
                    }
                });

                // ✅ Contar duplicatas por resposta normalizada
                const answerCounts = {};
                validAnswersForTheme.forEach(item => {
                    answerCounts[item.normalizedAnswer] = (answerCounts[item.normalizedAnswer] || 0) + 1;
                });

                // ✅ Aplicar pontuação baseada em duplicatas
                validAnswersForTheme.forEach(item => {
                    const count = answerCounts[item.normalizedAnswer];
                    const isUnique = count === 1;
                    const points = isUnique ? 100 : 50;
                    const reason = isUnique ? "Resposta única" : `Resposta repetida (${count} jogadores)`;
                    
                    // ✅ Atualizar pontos
                    config.playersAnswers[item.playerId].answers[theme].points = points;
                    config.playersAnswers[item.playerId].answers[theme].reason = reason;
                    
                    console.log(`[Socket.io] 📊 ${theme} - "${item.originalAnswer}" - ${item.playerNickname}: ${points} pontos (${isUnique ? 'única' : 'repetida'})`);
                });

                // ✅ Respostas inválidas ou vazias = 0 pontos
                Object.keys(config.playersAnswers).forEach(playerId => {
                    const playerAnswer = config.playersAnswers[playerId].answers[theme];
                    if (playerAnswer && (playerAnswer.points === null || playerAnswer.points === undefined)) {
                        playerAnswer.points = 0;
                        if (!playerAnswer.answer || !playerAnswer.answer.trim()) {
                            playerAnswer.reason = "Resposta vazia";
                        } else if (playerAnswer.valid === false) {
                            playerAnswer.reason = "Resposta inválida";
                        }
                    }
                });
            });

            // ✅ Enviar resultados individuais para cada jogador
            Object.keys(config.playersAnswers).forEach(playerId => {
                const playerData = config.playersAnswers[playerId];
                const playerSocket = io.sockets.sockets.get(playerId);
                
                if (playerSocket) {
                    let roundScore = 0;
                    const myAnswers = [];

                    // ✅ Calcular pontuação da rodada
                    themes.forEach(theme => {
                        const answerData = playerData.answers[theme];
                        if (answerData) {
                            roundScore += answerData.points || 0;
                            myAnswers.push({
                                theme,
                                answer: answerData.answer || "",
                                points: answerData.points || 0,
                                reason: answerData.reason || "Não validada"
                            });
                        }
                    });

                    // ✅ Atualizar pontuação total
                    playerSocket.totalScore = (playerSocket.totalScore || 0) + roundScore;

                    // ✅ Enviar resultado individual
                    playerSocket.emit('validation_complete_for_player', {
                        myAnswers,
                        myScore: roundScore,
                        myTotalScore: playerSocket.totalScore
                    });

                    console.log(`[Socket.io] 📊 Jogador ${playerData.nickname}: +${roundScore} pontos (Total: ${playerSocket.totalScore})`);
                }
            });

            // ✅ Emitir conclusão geral
            io.to(room).emit('validation_complete');

            // ✅ Limpar dados de validação
            delete config.validationQueue;
            delete config.currentValidation;
            delete config.validatorId;
            delete config.playersAnswers;

            console.log(`[Socket.io] ✅ Validação completada para sala ${room}`);

        } catch (error) {
            console.error('[Socket.io] Error completing validation:', error);
        }
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
