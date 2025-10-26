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

    // ✅ ADICIONAR: Handler para identificação do socket
    socket.on('identify', ({ userId, nickname }) => {
        console.log(`[Socket.io] 🆔 Socket ${socket.id} identificado como:`, { userId, nickname });
        
        // ✅ Armazenar dados no socket
        socket.userId = userId;
        socket.nickname = nickname;
        
        console.log(`[Socket.io] ✅ Socket identificado: ${nickname} (${userId})`);
    });

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

    socket.on("save_room", async ({ room, roomName, duration }) => {
  try {
    console.log(`[Socket.io] 💾 Salvando sala: ${room} com duração: ${duration}`);
    
    const config = roomConfigs[room];
    if (!config) {
      socket.emit("room_error", { message: "Sala não encontrada" });
      return;
    }

    // ✅ IMPORTANTE: Salvar duração se fornecida
    if (typeof duration === 'number') {
      config.duration = duration;
      console.log(`[Socket.io] ✅ Duração atualizada para: ${duration} segundos`);
    }

    // Salvar no Firestore
    const roomData = {
      name: roomName || room,
      themes: config.themes || [],
      duration: config.duration || 180, // ✅ INCLUIR duração
      createdAt: new Date(),
      createdBy: socket.userId,
      players: config.players || []
    };

    await db.collection('rooms').doc(room).set(roomData);
    
    // ✅ Marcar como salva
    config.isSaved = true;
    
    console.log(`[Socket.io] ✅ Sala ${room} salva com sucesso no Firestore`);
    
    // ✅ Emitir confirmação para toda a sala
    io.to(room).emit("room_saved_success", { 
      room: room,
      duration: config.duration // ✅ INCLUIR duração na resposta
    });

  } catch (error) {
    console.error(`[Socket.io] ❌ Erro ao salvar sala ${room}:`, error);
    socket.emit("room_error", { 
      message: "Erro ao salvar sala no banco de dados" 
    });
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

    // ✅ CORRIGIR: Handler reveal_answer
    socket.on('reveal_answer', ({ room }) => {
        try {
            console.log(`[Socket.io] Reveal answer requested for room ${room}`);
            
            // ✅ Verificar se há validação em progresso
            const config = roomConfigs[room];
            if (!config || !config.validationQueue || !config.validatorId) {
                console.log(`[Validation] No validation in progress for room ${room}`);
                return;
            }

            // ✅ Verificar se é o validador
            if (socket.userId !== config.validatorId) {
                console.log(`[Validation] Unauthorized reveal attempt by ${socket.userId} in room ${room}`);
                return;
            }

            // ✅ Obter item atual da validação
            const currentItem = config.validationQueue[config.currentValidation];
            if (!currentItem) {
                console.log(`[Validation] No current validation item for room ${room}`);
                return;
            }

            console.log(`[Socket.io] ✅ Revelando resposta: "${currentItem.answer}" para sala ${room}`);

            // ✅ Enviar para todos na sala
            io.to(room).emit('reveal', {
                playerId: currentItem.playerId,
                playerNickname: currentItem.playerNickname,
                theme: currentItem.theme,
                answer: currentItem.answer,
                currentIndex: config.currentValidation + 1,
                totalItems: config.validationQueue.length
            });

        } catch (error) {
            console.error('[Socket.io] Error revealing answer:', error);
        }
    });

    socket.on("validate_answer", async ({ valid, room }) => {
        try {
            console.log(`[Socket.io] ✅ Resposta validada: ${valid ? 'VÁLIDA' : 'INVÁLIDA'} na sala ${room}`);
            
            // ✅ CORRIGIR: Usar o sistema config.validationQueue em vez de gameState
            const config = roomConfigs[room];
            if (!config || !config.validationQueue || !config.playersAnswers) {
                console.log(`[Validation] No validation in progress for room ${room}`);
                return;
            }

            // ✅ Verificar se é o validador
            if (socket.userId !== config.validatorId) {
                console.log(`[Validation] Unauthorized validation by ${socket.userId} in room ${room}`);
                return;
            }

            // ✅ Obter item atual da validação
            const currentItem = config.validationQueue[config.currentValidation];
            if (!currentItem) {
                console.log(`[Validation] No current validation item for room ${room}`);
                return;
            }

            console.log(`[Socket.io] ✅ Resposta validada: { player: '${currentItem.playerNickname}', theme: '${currentItem.theme}', answer: '${currentItem.answer}', valid: ${valid} }`);

            // ✅ Aplicar validação na resposta correspondente
            const player = config.playersAnswers.find(p => p.playerId === currentItem.playerId);
            if (player) {
                const themeIndex = config.themes.indexOf(currentItem.theme);
                if (themeIndex !== -1 && player.answers[themeIndex]) {
                    player.answers[themeIndex].valid = valid;
                    player.answers[themeIndex].reason = valid ? "Validada pelo juiz" : "Invalidada pelo juiz";
                    console.log(`[Socket.io] ✅ Validação aplicada: ${player.nickname} - ${currentItem.theme} = ${valid}`);
                }
            }

            // ✅ Emitir resultado da validação para todos
            io.to(room).emit("answer_validated", {
                valid: valid,
                playerNickname: currentItem.playerNickname,
                answer: currentItem.answer,
                theme: currentItem.theme
            });

            // ✅ Avançar para próxima validação
            setTimeout(() => {
                processNextValidation(room);
            }, 200); // ✅ 2 segundos para mostrar resultado

        } catch (error) {
            console.error('[Socket.io] Error in validate_answer:', error);
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
            
            // ✅ MELHORIA 2: Limpar respostas da rodada anterior AQUI
            delete config.lastRoundAnswers;
            delete config.playersAnswers; // ✅ Limpar dados de validação aqui
            
            // ✅ Limpar respostas dos sockets
            const roomSockets = io.sockets.adapter.rooms.get(room);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const playerSocket = io.sockets.sockets.get(socketId);
                    if (playerSocket) {
                        delete playerSocket.submittedAnswers;
                    }
                }
            }
            
            if (gameState.has(room)) {
                const roomState = gameState.get(room);
                roomState.answers.clear();
                roomState.currentValidation = null;
            }

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

    // ✅ CORRIGIR: Função para encerrar jogo
    socket.on("end_game", ({ room }) => {
  try {
    console.log(`Game end requested for room ${room} by ${socket.userId}`);
    
    const config = roomConfigs[room]; // ✅ CORRIGIR: usar roomConfigs
    if (!config) {
      console.log(`No config found for room ${room}`);
      return;
    }

    // ✅ Verificar se jogo já foi encerrado
    if (config.gameEnded) {
      console.log(`Game already ended for room ${room}`);
      return;
    }

    // ✅ Marcar jogo como encerrado
    config.gameEnded = true;
    console.log(`Game ended for room ${room}`);

    // ✅ Calcular ranking final baseado nos totalScore dos sockets
    const finalRanking = [];
    const roomSockets = io.sockets.adapter.rooms.get(room);
    
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const playerSocket = io.sockets.sockets.get(socketId);
        if (playerSocket && playerSocket.userId && playerSocket.nickname) {
          finalRanking.push({
            playerId: playerSocket.userId,
            nickname: playerSocket.nickname,
            totalScore: playerSocket.totalScore || 0
          });
        }
      }
    }

    // ✅ Ordenar por pontuação (maior para menor)
    finalRanking.sort((a, b) => b.totalScore - a.totalScore);

    console.log(`[Socket.io] 🏆 Ranking final para sala ${room}:`, finalRanking);

    // ✅ Emitir ranking final para todos da sala
    io.to(room).emit("game_ended", {
      finalRanking: finalRanking,
      room: room
    });

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

    socket.on('get_room_config', ({ room }) => {
        console.log(`[Socket.io] 📋 Solicitação de configuração para sala: ${room}`);
        
        const config = roomConfigs[room];
        if (config) {
            console.log(`[Socket.io] ✅ Enviando configuração:`, {
                themes: config.themes,
                duration: config.duration,
                isSaved: config.isSaved
            });
            
            socket.emit('room_config', {
                themes: config.themes || [],
                duration: config.duration || 180,
                roundActive: config.roundActive || false,
                roundEnded: config.roundEnded || false,
                currentLetter: config.currentLetter || '',
                isSaved: config.isSaved || false
            });
        } else {
            console.log(`[Socket.io] ❌ Configuração não encontrada para sala: ${room}`);
        }
    });

    // ✅ ADICIONAR: Handler para start_round (que estava faltando)
    socket.on('start_round', ({ room }) => {
        try {
            console.log(`[Socket.io] 🚀 Start round requested for room ${room} by ${socket.userId}`);
            
            const config = roomConfigs[room];
            if (!config) {
                console.error(`[Socket.io] Room config not found for ${room}`);
                return;
            }
            
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized start_round attempt by ${socket.userId} in room ${room}`);
                return;
            }

            if (config.roundActive || config.isCountingDown) {
                console.log(`[Socket.io] Round already active or counting down for room ${room}`);
                return;
            }

            console.log(`[Socket.io] ✅ Iniciando countdown para sala ${room}`);
            startRoundCountdown(room);
            
        } catch (error) {
            console.error('[Socket.io] Error starting round:', error);
        }
    });

    // ✅ ADICIONAR: Handler time_up (que estava completamente ausente)
    socket.on('time_up', async (data = {}) => {
        try {
            const room = data.room || socket.room;
            if (!room) throw new Error("Room not specified");

            console.log(`[Socket.io] ⏰ Tempo esgotado na sala ${room} - Processando automaticamente`);
            
            const config = roomConfigs[room];
            if (!config || !config.roundActive) {
                console.log(`[Socket.io] ⚠️ Rodada não está ativa ou sala não encontrada: ${room}`);
                return;
            }

            console.log(`[Socket.io] 🛑 Finalizando rodada por timeout na sala ${room}`);

            // ✅ Marcar rodada como finalizada
            config.roundActive = false;
            config.roundEnded = true;

            // ✅ IMPORTANTE: Admin vira validador automaticamente quando tempo esgota
            const adminId = config.creatorId;
            config.stopClickedByMe = adminId; // ✅ Admin "clicou" STOP automaticamente
            
            console.log(`[Socket.io] 🎯 Admin definido como validador após timeout: ${adminId}`);

            // ✅ Emitir fim de rodada (mesmo evento que stop_round)
            console.log(`[Socket.io] ✅ Evento 'time_up_round_ended' enviado para sala ${room}`);
            io.to(room).emit('time_up_round_ended', { 
                validatorId: adminId,
                message: "Tempo esgotado!"
            });

            emitRoomConfig(room, config);

            console.log(`[Socket.io] Round ended by timeout for room ${room}, admin is validator`);

            // ✅ IMPORTANTE: Iniciar processo de validação automaticamente
            setTimeout(() => {
                console.log(`[Socket.io] 🔄 Iniciando validação automática após timeout...`);
                startValidationProcess(room, adminId); // ✅ Admin será o validador
            }, 2000);

        } catch (error) {
            console.error('[Socket.io] Error in time_up:', error);
            socket.emit("error", { message: error.message });
        }
    });

}); // ✅ FECHAR o io.on('connection')

// ✅ MOVER: Funções para FORA do socket connection

// ✅ Função para iniciar processo de validação
function startValidationProcess(room, validatorId) {
    try {
        console.log(`[Socket.io] 🔄 Iniciando processo de validação para sala ${room}, validador: ${validatorId}`);
        
        const config = roomConfigs[room];
        if (!config) {
            console.log(`[Socket.io] ❌ Configuração não encontrada para sala ${room}`);
            return;
        }
        
        // ✅ Coletar respostas de todos os jogadores na sala
        const allAnswers = [];
        const roomSockets = io.sockets.adapter.rooms.get(room);
        
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const playerSocket = io.sockets.sockets.get(socketId);
                if (playerSocket && playerSocket.userId && playerSocket.submittedAnswers) {
                    console.log(`[Socket.io] 📝 Coletando respostas de ${playerSocket.nickname}:`, playerSocket.submittedAnswers);
                    
                    const playerAnswers = {
                        playerId: playerSocket.userId,
                        nickname: playerSocket.nickname,
                        answers: playerSocket.submittedAnswers.map(answer => ({
                            theme: answer.theme,
                            answer: answer.answer || "",
                            points: null,
                            reason: "",
                            valid: null
                        }))
                    };
                    
                    allAnswers.push(playerAnswers);
                }
            }
        }
        
        console.log(`[Socket.io] 📊 Total de respostas coletadas: ${allAnswers.length}`);
        
        if (allAnswers.length === 0) {
            console.log(`[Socket.io] ❌ Nenhuma resposta para validar na sala ${room}`);
            io.to(room).emit("no_answers_to_validate");
            return;
        }
        
        // ✅ Encontrar validador
        const roomSocketsArray = Array.from(roomSockets);
        const validatorSocket = roomSocketsArray.map(socketId => io.sockets.sockets.get(socketId))
            .find(socket => socket && socket.userId === validatorId);
        
        const validatorNickname = validatorSocket ? validatorSocket.nickname : "Desconhecido";
        
        // ✅ Criar fila de validação
        const validationQueue = [];
        let itemIndex = 1;
        
        // ✅ Para cada tema
        config.themes.forEach((theme, themeIndex) => {
            // ✅ Para cada jogador neste tema
            allAnswers.forEach(player => {
                const answer = player.answers[themeIndex];
                if (answer) {
                    validationQueue.push({
                        playerId: player.playerId,
                        playerNickname: player.nickname,
                        theme: theme,
                        answer: answer.answer || "",
                        currentIndex: itemIndex,
                        totalItems: allAnswers.length * config.themes.length,
                        validatorId: validatorId,
                        validatorNickname: validatorNickname
                    });
                    itemIndex++;
                }
            });
        });
        
        console.log(`[Socket.io] 🎯 Fila de validação criada com ${validationQueue.length} itens`);
        
        if (validationQueue.length === 0) {
            console.log(`[Socket.io] ❌ Fila de validação vazia para sala ${room}`);
            io.to(room).emit("no_answers_to_validate");
            return;
        }
        
        // ✅ Configurar estado de validação
        config.validationQueue = validationQueue;
        config.currentValidation = 0;
        config.validatorId = validatorId;
        config.playersAnswers = allAnswers;
        
        // ✅ Iniciar primeira validação
        const firstItem = validationQueue[0];
        console.log(`[Socket.io] 🎯 Enviando primeira validação:`, firstItem);
        
        io.to(room).emit("start_validation", firstItem);
        
    } catch (error) {
        console.error('[Socket.io] Erro no processo de validação:', error);
    }
}

// ✅ Função para processar próxima validação
function processNextValidation(room) {
    try {
        const config = roomConfigs[room];
        if (!config || !config.validationQueue) {
            console.log(`[Socket.io] ❌ No validation queue for room ${room}`);
            return;
        }
        
        config.currentValidation++;
        
        if (config.currentValidation < config.validationQueue.length) {
            const nextItem = config.validationQueue[config.currentValidation];
            console.log(`[Socket.io] 🔍 processNextValidation - Atual: ${config.currentValidation}/${config.validationQueue.length}`);
            console.log(`[Socket.io] 🎯 Validador definido: ${config.validatorId}`);
            console.log(`[Socket.io] 🎯 Validando item ${nextItem.currentIndex}/${nextItem.totalItems}:`);
            console.log(`[Socket.io] 👤 Jogador: ${nextItem.playerNickname}`);
            console.log(`[Socket.io] 📋 Tema: ${nextItem.theme}`);
            console.log(`[Socket.io] 💭 Resposta: "${nextItem.answer}"`);
            
            // ✅ Emitir próxima validação
            io.to(room).emit("start_validation", nextItem);
        } else {
            console.log(`[Socket.io] 🏁 Completando validação para sala ${room}`);
            completeValidation(room);
        }
    } catch (error) {
        console.error('[Socket.io] Error in processNextValidation:', error);
    }
}

// ✅ Função para completar validação
function completeValidation(room) {
    try {
        console.log(`[Socket.io] 🏁 Completando validação para sala ${room}`);
        
        const config = roomConfigs[room];
        if (!config || !config.playersAnswers) {
            console.log(`[Socket.io] ❌ No answers data for room ${room}`);
            return;
        }
        
        // ✅ Calcular pontuações por tema
        config.themes.forEach((theme, themeIndex) => {
            console.log(`[Socket.io] 🎯 Calculando pontos para tema: ${theme}`);
            applyThemeScoring(room, themeIndex, config.playersAnswers, config.themes);
        });
        
        // ✅ Enviar resultados individuais para cada jogador
        config.playersAnswers.forEach(player => {
            const roundScore = player.answers.reduce((total, answer) => {
                return total + (answer.points || 0);
            }, 0);
            
            // ✅ Encontrar socket do jogador
            const roomSockets = io.sockets.adapter.rooms.get(room);
            let playerSocket = null;
            
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const socket = io.sockets.sockets.get(socketId);
                    if (socket && socket.userId === player.playerId) {
                        playerSocket = socket;
                        break;
                    }
                }
            }
            
            if (playerSocket) {
                // ✅ Atualizar totalScore do socket
                if (!playerSocket.totalScore) {
                    playerSocket.totalScore = 0;
                }
                playerSocket.totalScore += roundScore;
                
                console.log(`[Socket.io] 📊 Jogador ${player.nickname}: +${roundScore} pontos (Total: ${playerSocket.totalScore})`);
                
                // ✅ Enviar resultado individual
                playerSocket.emit("validation_complete_for_player", {
                    myScore: roundScore,
                    myTotalScore: playerSocket.totalScore,
                    myAnswers: player.answers.map(answer => ({
                        theme: answer.theme,
                        answer: answer.answer,
                        points: answer.points,
                        reason: answer.reason,
                        validated: true
                    }))
                });
            }
        });
        
        console.log(`[Socket.io] ✅ Validação completada para sala ${room}`);
        
        // ✅ Limpar dados de validação
        delete config.validationQueue;
        delete config.currentValidation;
        delete config.validatorId;
        
        // ✅ Notificar que validação terminou
        io.to(room).emit("validation_complete", {
            message: "Validação completa!",
            allAnswers: config.playersAnswers
        });
        
    } catch (error) {
        console.error('[Socket.io] Error in completeValidation:', error);
    }
}

// ✅ Inicializar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
