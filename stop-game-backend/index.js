require('dotenv').config({ path: '../.env' });

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const admin = require('firebase-admin');

// ✅ CORRIGIR: Inicialização do Firebase
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');
    
    if (!serviceAccount.project_id) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON não configurada ou project_id ausente");
    }
    
    // ✅ IMPORTANTE: Verificar se já foi inicializado
    let app;
    try {
        app = admin.app(); // Tenta pegar app existente
    } catch (e) {
        // Se não existe, inicializa
        app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id // ✅ ADICIONAR: Definir explicitamente
        });
    }
    
    console.log("🔥 Firebase Admin SDK inicializado com sucesso!");
    console.log("📋 Projeto:", serviceAccount.project_id); // ✅ USAR: serviceAccount.project_id
    console.log("📋 App Name:", app.name);
    
} catch (e) {
    console.error("❌ Erro ao inicializar Firebase Admin SDK:", e);
    throw e;
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

// ✅ REMOVER: appId desnecessário (causando caminho complexo)
// const appId = "stop-game-app";

// ✅ USAR: Referência direta para onde os dados estão
const roomsCollectionRef = db.collection('rooms');

// ✅ ADICIONAR: Funções para persistência de validação
async function saveValidationStateToFirestore(roomId, validationState) {
    try {
        // ✅ USAR: referência simples
        const validationRef = db.collection('validation_states').doc(roomId);

        await validationRef.set({
            ...validationState,
            savedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`[Firestore] Estado de validação salvo para sala ${roomId}`);
        return true;
    } catch (error) {
        console.error(`[Firestore] Erro ao salvar estado de validação:`, error);
        return false;
    }
}

async function loadValidationStateFromFirestore(roomId) {
    try {
        // ✅ USAR: referência simples
        const validationRef = db.collection('validation_states').doc(roomId);

        const doc = await validationRef.get();
        if (doc.exists) {
            console.log(`[Firestore] Estado de validação carregado para sala ${roomId}`);
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error(`[Firestore] Erro ao carregar estado de validação:`, error);
        return null;
    }
}

async function clearValidationStateFromFirestore(roomId) {
    try {
        // ✅ USAR: referência simples  
        const validationRef = db.collection('validation_states').doc(roomId);

        await validationRef.delete();
        console.log(`[Firestore] Estado de validação removido para sala ${roomId}`);
        return true;
    } catch (error) {
        console.error(`[Firestore] Erro ao limpar estado de validação:`, error);
        return false;
    }
}

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

// ✅ MELHORAR: Função de salvar (garantir local correto)
async function saveRoomConfigToFirestore(roomId, config) {
    try {
        console.log(`[Firestore] 💾 Salvando sala ${roomId} em /rooms/...`);
        
        const docRef = roomsCollectionRef.doc(roomId);
        
        // ✅ Salvar configuração COMPLETA
        const configToSave = {
            themes: config.themes || [],
            duration: config.duration || 180,
            createdAt: config.createdAt || new Date(),
            creatorId: config.creatorId,
            players: config.players || {},
            isSaved: true,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'artifacts' // ✅ Marcar se foi migrada
        };
        
        await docRef.set(configToSave, { merge: true });
        
        console.log(`[Firestore] ✅ Sala ${roomId} salva em /rooms/:`, {
            themes: configToSave.themes.length,
            duration: configToSave.duration,
            players: Object.keys(configToSave.players).length
        });
        
        return true;
    } catch (error) {
        console.error(`[Firestore Error] ❌ Erro ao salvar sala ${roomId}:`, error);
        return false;
    }
}

// ✅ CORRIGIR: Função que busca em AMBOS os locais
async function getRoomConfigFromFirestore(roomId) {
    try {
        console.log(`[Firestore] 🔍 Buscando sala ${roomId} em múltiplos locais...`);
        
        // ✅ PRIMEIRO: Tentar buscar na coleção simples (/rooms/)
        let doc = await roomsCollectionRef.doc(roomId).get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`[Firestore] ✅ Sala ${roomId} encontrada em /rooms/:`, {
                themes: data.themes?.length || 0,
                duration: data.duration,
                players: Object.keys(data.players || {}).length,
                isSaved: data.isSaved
            });
            return data;
        }
        
        // ✅ SEGUNDO: Se não encontrou, tentar na coleção aninhada
        console.log(`[Firestore] 🔍 Não encontrada em /rooms/, tentando /artifacts/...`);
        
        const nestedRef = db
            .collection('artifacts')
            .doc('stop-game-app')
            .collection('public')
            .doc('data')
            .collection('rooms')
            .doc(roomId);
            
        doc = await nestedRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`[Firestore] ✅ Sala ${roomId} encontrada em /artifacts/:`, {
                themes: data.themes?.length || 0,
                duration: data.duration,
                players: Object.keys(data.players || {}).length,
                isSaved: data.isSaved
            });
            
            // ✅ MIGRAR: Mover dados para coleção simples
            console.log(`[Firestore] 📦 Migrando sala ${roomId} para coleção /rooms/...`);
            await roomsCollectionRef.doc(roomId).set(data, { merge: true });
            console.log(`[Firestore] ✅ Migração concluída para sala ${roomId}`);
            
            return data;
        }
        
        console.log(`[Firestore] ❌ Sala ${roomId} não encontrada em nenhum local.`);
        return null;
        
    } catch (error) {
        console.error(`[Firestore Error] ❌ Erro ao buscar sala ${roomId}:`, error);
        return null;
    }
}

function emitRoomConfig(roomId, config) {
    io.to(roomId).emit("room_config", sanitizeRoomConfig(config));
}

// ------------------------
// Estado do servidor
// ------------------------
const roomConfigs = {};

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
            players: {},
            themes: ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'],
            duration: 180,
            createdAt: new Date(),
            validationInProgress: false
        });
    }
    return gameState.get(room);
}

// CORREÇÃO: Função startRoundCountdown com controle de estado
function startRoundCountdown(room) {
    const config = roomConfigs[room];
    if (!config) {
        console.log(`[Countdown] ❌ Configuração não encontrada para sala ${room}`);
        return;
    }

    if (config.isCountingDown) {
        console.log(`[Countdown] ⚠️ Countdown já em andamento para sala ${room}`);
        return;
    }

    console.log(`[Countdown] 🚀 Iniciando countdown para sala ${room}`);
    console.log(`[Countdown] 👥 Jogadores na sala: ${Object.keys(config.players || {}).length}`);
    
    let countdown = 3;
    config.isCountingDown = true;
    
    const countdownInterval = setInterval(async () => {
        console.log(`[Countdown] ⏰ Emitindo countdown ${countdown} para sala ${room}`);
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
            
            console.log(`[Countdown] ✅ Rodada iniciada na sala ${room} com letra '${letter}'`);
            
            // ✅ EMITIR eventos
            io.to(room).emit("round_started", { letter });
            emitRoomConfig(room, config);
            
            console.log(`[Countdown] 📡 Eventos enviados para sala ${room}`);
        }
    }, 1000);
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
            
            // ✅ IMPORTANTE: Atualizar progresso no Firestore
            const validationState = {
                validationQueue: config.validationQueue,
                currentValidation: config.currentValidation,
                validatorId: config.validatorId,
                playersAnswers: config.playersAnswers,
                roomId: room,
                updatedAt: new Date().toISOString()
            };
            
            saveValidationStateToFirestore(room, validationState);
            
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
        const validationState = {
            validationQueue: validationQueue,
            currentValidation: 0,
            validatorId: validatorId,
            playersAnswers: allAnswers,
            roomId: room,
            startedAt: new Date().toISOString()
        };
        
        config.validationQueue = validationQueue;
        config.currentValidation = 0;
        config.validatorId = validatorId;
        config.playersAnswers = allAnswers;
        config.validationInProgress = true;
        
        // ✅ IMPORTANTE: Salvar estado no Firestore
        saveValidationStateToFirestore(room, validationState);
        
        // ✅ Iniciar primeira validação
        const firstItem = validationQueue[0];
        console.log(`[Socket.io] 🎯 Enviando primeira validação:`, firstItem);
        
        io.to(room).emit("start_validation", firstItem);
        
    } catch (error) {
        console.error('[Socket.io] Erro no processo de validação:', error);
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
        config.validationInProgress = false;
        
        // ✅ IMPORTANTE: Limpar estado do Firestore
        clearValidationStateFromFirestore(room);
        
        // ✅ Notificar que validação terminou
        io.to(room).emit("validation_complete", {
            message: "Validação completa!",
            allAnswers: config.playersAnswers
        });
        
    } catch (error) {
        console.error('[Socket.io] Error in completeValidation:', error);
    }
}

// Lógica Socket.IO
io.on('connection', (socket) => {
    console.log(`[Socket.io] Nova conexão: ${socket.id}`);

    // ✅ Handler join_room (ÚNICO E CORRETO)
    socket.on("join_room", async (data) => {
        try {
            const { userId, nickname, room, isReconnecting = false } = data;
            
            console.log(`[Socket.io] 🔗 Tentativa de entrada na sala: ${room} por ${nickname} (${userId})`);

            // ✅ PRIMEIRA PRIORIDADE: Verificar se há validação em progresso no Firestore
            const savedValidationState = await loadValidationStateFromFirestore(room);
            
            // ✅ SEGUNDA PRIORIDADE: Verificar se há configuração salva NO FIRESTORE PRIMEIRO
            let roomConfig = roomConfigs[room];
            
            if (!roomConfig) {
                console.log(`[Socket.io] 🔍 Sala ${room} não existe na memória - buscando no Firestore...`);
                
                // ✅ IMPORTANTE: Tentar carregar do Firestore PRIMEIRO
                const savedConfig = await getRoomConfigFromFirestore(room);
                
                if (savedConfig) {
                    console.log(`[Socket.io] ✅ Configuração encontrada no Firestore:`, savedConfig);
                    
                    // ✅ Usar configuração salva do Firestore
                    roomConfig = {
                        ...savedConfig,
                        players: savedConfig.players || {}, // ✅ Preservar players salvos
                        roundActive: false,
                        roundEnded: false,
                        currentLetter: '',
                        validationInProgress: false
                    };
                    
                    roomConfigs[room] = roomConfig;
                } else {
                    console.log(`[Socket.io] ❌ Nenhuma configuração salva encontrada - criando nova sala`);
                    
                    // ✅ APENAS se não houver configuração salva, criar padrão
                    roomConfig = {
                        themes: ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'], // ✅ Padrão
                        duration: 180, // ✅ Padrão
                        createdAt: new Date(),
                        creatorId: userId,
                        players: {},
                        roundActive: false,
                        roundEnded: false,
                        currentLetter: '',
                        isSaved: false,
                        validationInProgress: false
                    };
                    
                    roomConfigs[room] = roomConfig;
                }
            }

            // ✅ RESTAURAR: Estado de validação se existir
            if (savedValidationState) {
                console.log(`[Socket.io] 🎯 Restaurando estado de validação:`, savedValidationState);
                
                roomConfig.validationQueue = savedValidationState.validationQueue;
                roomConfig.currentValidation = savedValidationState.currentValidation;
                roomConfig.validatorId = savedValidationState.validatorId;
                roomConfig.playersAnswers = savedValidationState.playersAnswers;
                roomConfig.validationInProgress = true;
            }

            // ✅ IMPORTANTE: Sincronizar gameState com roomConfig
            if (!gameState.has(room)) {
                gameState.set(room, {
                    players: roomConfig.players || {},
                    themes: roomConfig.themes,
                    duration: roomConfig.duration,
                    createdAt: roomConfig.createdAt,
                    validationInProgress: roomConfig.validationInProgress || false
                });
            } else {
                // ✅ Atualizar gameState existente com dados salvos
                const roomData = gameState.get(room);
                roomData.players = roomConfig.players || {};
                roomData.themes = roomConfig.themes;
                roomData.duration = roomConfig.duration;
                roomData.validationInProgress = roomConfig.validationInProgress || false;
            }
            
            const roomData = gameState.get(room);

            // ✅ Verificar se é reconexão
            if (isReconnecting) {
                console.log(`[Socket.io] 🔄 Processando reconexão para ${nickname}`);
                
                // ✅ Verificar se jogador existe nos dados salvos
                const existingPlayer = Object.values(roomConfig.players || {}).find(p => p.userId === userId);
                
                if (existingPlayer) {
                    console.log(`[Socket.io] ✅ Jogador encontrado nos dados salvos - reconectando`);
                    
                    // ✅ Atualizar dados do jogador
                    existingPlayer.socketId = socket.id;
                    existingPlayer.disconnectedAt = null;
                    
                    // ✅ Sincronizar com gameState
                    roomData.players[userId] = existingPlayer;
                    
                    // ✅ Definir dados do socket
                    socket.userId = userId;
                    socket.nickname = nickname;
                    socket.roomId = room;
                    socket.join(room);
                    
                    socket.emit("room_joined", {
                        room: room,
                        player: existingPlayer,
                        players: Object.values(roomData.players)
                    });
                    
                    // ✅ IMPORTANTE: Enviar configuração CORRETA (do Firestore)
                    socket.emit("room_config", {
                        themes: roomConfig.themes,
                        duration: roomConfig.duration,
                        roundActive: roomConfig.roundActive || false,
                        roundEnded: roomConfig.roundEnded || false,
                        currentLetter: roomConfig.currentLetter || '',
                        isSaved: roomConfig.isSaved || false,
                        validationInProgress: roomConfig.validationInProgress || false,
                        createdAt: roomConfig.createdAt,
                        creatorId: roomConfig.creatorId
                    });
                    
                    // ✅ Se há validação em progresso, retomar
                    if (roomConfig.validationInProgress && roomConfig.validationQueue) {
                        console.log(`[Socket.io] 🎯 Retomando validação em progresso`);
                        
                        const currentItem = roomConfig.validationQueue[roomConfig.currentValidation];
                        if (currentItem) {
                            console.log(`[Socket.io] ✅ Enviando item atual de validação:`, currentItem);
                            io.to(room).emit("start_validation", currentItem);
                        }
                    }
                    
                    socket.to(room).emit("player_reconnected", {
                        userId: userId,
                        nickname: existingPlayer.nickname
                    });
                    
                    console.log(`[Socket.io] ✅ Reconexão bem-sucedida para ${nickname}`);
                    return;
                } else {
                    console.log(`[Socket.io] ❌ Jogador não encontrado nos dados salvos - tratando como nova entrada`);
                    // Continua para lógica normal de entrada
                }
            }

            // ✅ Lógica normal de entrada na sala
            const existingPlayer = Object.values(roomConfig.players).find(p => 
                p.userId === userId || p.nickname === nickname
            );

            if (existingPlayer && existingPlayer.userId === userId) {
                // ✅ Atualizar jogador existente
                existingPlayer.socketId = socket.id;
                existingPlayer.disconnectedAt = null;
                
                // ✅ Sincronizar com gameState
                roomData.players[userId] = existingPlayer;
            } else if (existingPlayer && existingPlayer.nickname === nickname) {
                socket.emit("room_error", { 
                    message: "Já existe um jogador com este nickname na sala" 
                });
                return;
            } else {
                // ✅ Adicionar novo jogador
                const newPlayer = {
                    userId: userId,
                    nickname: nickname,
                    socketId: socket.id,
                    isCreator: Object.keys(roomConfig.players).length === 0,
                    joinedAt: new Date(),
                    disconnectedAt: null
                };
                
                roomConfig.players[userId] = newPlayer;
                roomData.players[userId] = newPlayer;

                // ✅ IMPORTANTE: Se for o primeiro jogador e não há creatorId, definir como criador
                if (Object.keys(roomConfig.players).length === 1 && !roomConfig.creatorId) {
                    roomConfig.creatorId = userId;
                    newPlayer.isCreator = true;
                }
            }

            socket.userId = userId;
            socket.nickname = nickname;
            socket.roomId = room;
            socket.join(room);

            const currentPlayer = roomConfig.players[userId];
            const allPlayers = Object.values(roomConfig.players);

            socket.emit("room_joined", {
                room: room,
                player: currentPlayer,
                players: allPlayers
            });

            // ✅ CORRIGIR: Enviar configuração COMPLETA e CORRETA
            socket.emit("room_config", {
                themes: roomConfig.themes,
                duration: roomConfig.duration,
                roundActive: roomConfig.roundActive || false,
                roundEnded: roomConfig.roundEnded || false,
                currentLetter: roomConfig.currentLetter || '',
                isSaved: roomConfig.isSaved || false,
                validationInProgress: roomConfig.validationInProgress || false,
                createdAt: roomConfig.createdAt,
                creatorId: roomConfig.creatorId
            });

            socket.to(room).emit("players_update", allPlayers);
            
            console.log(`[Socket.io] ✅ ${nickname} entrou na sala ${room} com sucesso`);
            console.log(`[Socket.io] 📊 Configuração atual:`, {
                themes: roomConfig.themes?.length || 0,
                duration: roomConfig.duration,
                isSaved: roomConfig.isSaved
            });

            // ✅ Se há validação em progresso, enviar estado atual
            if (roomConfig.validationInProgress && roomConfig.validationQueue) {
                console.log(`[Socket.io] 🎯 Enviando estado atual de validação para novo jogador`);
                
                const currentItem = roomConfig.validationQueue[roomConfig.currentValidation];
                if (currentItem) {
                    socket.emit("start_validation", currentItem);
                }
            }

        } catch (error) {
            console.error(`[Socket.io] ❌ Erro ao processar join_room:`, error);
            socket.emit("room_error", { 
                message: "Erro interno do servidor" 
            });
        }
    });

    // ✅ Handler para retomar validação
    socket.on("resume_validation", async (data) => {
        try {
            const { room, userId } = data;
            console.log(`[Socket.io] 🎯 Tentativa de retomar validação - Room: ${room}, User: ${userId}`);
            
            const config = roomConfigs[room];
            
            // Se não há validação na memória, tentar carregar do Firestore
            if (!config || !config.validationInProgress) {
                const savedValidationState = await loadValidationStateFromFirestore(room);
                
                if (!savedValidationState) {
                    socket.emit("validation_error", { 
                        message: "Não há validação em progresso" 
                    });
                    return;
                }
                
                // Restaurar estado de validação
                config.validationQueue = savedValidationState.validationQueue;
                config.currentValidation = savedValidationState.currentValidation;
                config.validatorId = savedValidationState.validatorId;
                config.playersAnswers = savedValidationState.playersAnswers;
                config.validationInProgress = true;
            }
            
            if (config.validatorId !== userId) {
                socket.emit("validation_error", { 
                    message: "Você não é o validador atual" 
                });
                return;
            }
            
            if (!config.validationQueue || config.currentValidation >= config.validationQueue.length) {
                socket.emit("validation_error", { 
                    message: "Validação já foi concluída" 
                });
                return;
            }
            
            // Retomar validação do item atual
            const currentItem = config.validationQueue[config.currentValidation];
            console.log(`[Socket.io] ✅ Retomando validação do item:`, currentItem);
            
            io.to(room).emit("start_validation", currentItem);
            
        } catch (error) {
            console.error('[Socket.io] Erro ao retomar validação:', error);
            socket.emit("validation_error", { 
                message: "Erro interno do servidor" 
            });
        }
    });

    // ✅ Outros handlers (manter os existentes)
    socket.on('update_themes', async ({ room, themes }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] Unauthorized theme update attempt by ${socket.userId}`);
                return;
            }

            if (themes && Array.isArray(themes) && themes.length > 0) {
                const validThemes = themes.filter(theme => 
                    typeof theme === 'string' && theme.trim().length > 0
                ).map(theme => theme.trim());
                
                if (validThemes.length > 0) {
                    config.themes = validThemes;
                    config.isSaved = false;
                    
                    io.to(room).emit('themes_updated', { themes: config.themes });
                    emitRoomConfig(room, config);
                    
                    console.log(`[Socket.io] ✅ Temas atualizados para sala ${room}`);
                }
            }
        } catch (error) {
            console.error('[Socket.io] Error updating themes:', error);
        }
    });

    // ✅ CORRIGIR: Handler save_room para usar a função correta (linha ~950)
    socket.on("save_room", async ({ room, roomName, duration }) => {
        try {
            console.log(`[Socket.io] 💾 Salvando sala: ${room} com duração: ${duration}`);
            
            const config = roomConfigs[room];
            if (!config) {
                socket.emit("room_error", { message: "Sala não encontrada" });
                return;
            }

            if (typeof duration === 'number') {
                config.duration = duration;
            }

            // ✅ IMPORTANTE: Usar a função correta de salvar
            const saved = await saveRoomConfigToFirestore(room, config);
            
            if (saved) {
                config.isSaved = true;
                
                console.log(`[Socket.io] ✅ Sala ${room} salva com sucesso no Firestore`);
                
                io.to(room).emit("room_saved_success", { 
                    room: room,
                    duration: config.duration
                });
            } else {
                socket.emit("room_error", { 
                    message: "Erro ao salvar sala no banco de dados" 
                });
            }

        } catch (error) {
            console.error(`[Socket.io] ❌ Erro ao salvar sala ${room}:`, error);
            socket.emit("room_error", { 
                message: "Erro ao salvar sala no banco de dados" 
            });
        }
    });

    socket.on('submit_answers', async ({ room, answers }) => {
        try {
            console.log(`[Socket.io] 📝 Respostas recebidas de ${socket.nickname}:`, answers);
            
            socket.submittedAnswers = answers;
            socket.emit('answers_received');
            
        } catch (error) {
            console.error('[Socket.io] Error handling submit_answers:', error);
        }
    });

    // ✅ CORRIGIR: Handler start_round (estava sem logs suficientes)
    socket.on('start_round', ({ room }) => {
        try {
            console.log(`[Socket.io] 🚀 Tentativa de iniciar rodada na sala: ${room} por ${socket.nickname} (${socket.userId})`);
            
            const config = roomConfigs[room];
            if (!config) {
                console.log(`[Socket.io] ❌ Configuração da sala ${room} não encontrada`);
                socket.emit("room_error", { message: "Sala não encontrada" });
                return;
            }

            // ✅ VERIFICAR: Se é o criador
            if (socket.userId !== config.creatorId) {
                console.log(`[Socket.io] ❌ Usuário ${socket.userId} não é o criador da sala ${room}. Criador: ${config.creatorId}`);
                socket.emit("room_error", { message: "Apenas o criador pode iniciar a rodada" });
                return;
            }

            // ✅ VERIFICAR: Se rodada já está ativa
            if (config.roundActive) {
                console.log(`[Socket.io] ⚠️ Rodada já está ativa na sala ${room}`);
                socket.emit("room_error", { message: "Rodada já está em andamento" });
                return;
            }

            // ✅ VERIFICAR: Se countdown já está rodando
            if (config.isCountingDown) {
                console.log(`[Socket.io] ⚠️ Countdown já está em andamento na sala ${room}`);
                socket.emit("room_error", { message: "Countdown já está em andamento" });
                return;
            }

            console.log(`[Socket.io] ✅ Iniciando countdown para sala ${room}`);
            startRoundCountdown(room);
            
        } catch (error) {
            console.error('[Socket.io] ❌ Erro ao iniciar rodada:', error);
            socket.emit("room_error", { message: "Erro interno do servidor" });
        }
    });

    socket.on('stop_round', async (data = {}) => {
        try {
            const room = data.room || socket.roomId;
            if (!room) return;

            const config = roomConfigs[room];
            if (!config || !config.roundActive) return;

            const validatorId = socket.userId;

            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = socket.userId;

            io.to(room).emit('time_up_round_ended', { validatorId });
            emitRoomConfig(room, config);

            setTimeout(() => {
                startValidationProcess(room, validatorId);
            }, 2000);

        } catch (error) {
            console.error('[Socket.io] Error in stop_round:', error);
        }
    });

    socket.on('time_up', async (data = {}) => {
        try {
            const room = data.room || socket.roomId;
            if (!room) return;

            const config = roomConfigs[room];
            if (!config || !config.roundActive) return;

            const adminId = config.creatorId;
            
            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = adminId;

            io.to(room).emit('time_up_round_ended', { 
                validatorId: adminId,
                message: "Tempo esgotado!"
            });

            emitRoomConfig(room, config);

            setTimeout(() => {
                startValidationProcess(room, adminId);
            }, 2000);

        } catch (error) {
            console.error('[Socket.io] Error in time_up:', error);
        }
    });

    socket.on("validate_answer", async ({ valid, room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || !config.validationQueue || !config.playersAnswers) return;

            if (socket.userId !== config.validatorId) return;

            const currentItem = config.validationQueue[config.currentValidation];
            if (!currentItem) return;

            const player = config.playersAnswers.find(p => p.playerId === currentItem.playerId);
            if (player) {
                const themeIndex = config.themes.indexOf(currentItem.theme);
                if (themeIndex !== -1 && player.answers[themeIndex]) {
                    player.answers[themeIndex].valid = valid;
                    player.answers[themeIndex].reason = valid ? "Validada pelo juiz" : "Invalidada pelo juiz";
                }
            }

            io.to(room).emit("answer_validated", {
                valid: valid,
                playerNickname: currentItem.playerNickname,
                answer: currentItem.answer,
                theme: currentItem.theme
            });

            setTimeout(() => {
                processNextValidation(room);
            }, 200);

        } catch (error) {
            console.error('[Socket.io] Error in validate_answer:', error);
        }
    });

    socket.on("new_round", async ({ room, resetLetters = false }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) return;

            if (resetLetters) {
                clearRoomLetters(room);
            }

            config.roundActive = false;
            config.roundEnded = false;
            config.stopClickedByMe = false;
            config.currentLetter = null;
            config.isCountingDown = false;
            config.gameEnded = false;
            
            delete config.lastRoundAnswers;
            delete config.playersAnswers;
            
            const roomSockets = io.sockets.adapter.rooms.get(room);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const playerSocket = io.sockets.sockets.get(socketId);
                    if (playerSocket) {
                        delete playerSocket.submittedAnswers;
                    }
                }
            }

            io.to(room).emit("new_round_started", {
                message: "Nova rodada iniciada!",
                themes: config.themes
            });
            
            emitRoomConfig(room, config);
            
        } catch (error) {
            console.error('[Socket.io] Error starting new round:', error);
        }
    });

    socket.on("end_game", ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config || config.gameEnded) return;

            config.gameEnded = true;

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

            finalRanking.sort((a, b) => b.totalScore - a.totalScore);

            io.to(room).emit("game_ended", {
                finalRanking: finalRanking,
                room: room
            });

        } catch (error) {
            console.error('[Socket.io] Error ending game:', error);
        }
    });

    socket.on('get_room_config', ({ room }) => {
        const config = roomConfigs[room];
        if (config) {
            socket.emit('room_config', {
                themes: config.themes || [],
                duration: config.duration || 180,
                roundActive: config.roundActive || false,
                roundEnded: config.roundEnded || false,
                currentLetter: config.currentLetter || '',
                isSaved: config.isSaved || false,
                validationInProgress: config.validationInProgress || false
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] Desconexão: ${socket.id} (userId: ${socket.userId})`);
        
        if (socket.userId && socket.roomId) {
            const room = socket.roomId;
            const config = roomConfigs[room];
            
            if (config && config.players) {
                delete config.players[socket.userId];
                
                const playersArray = Object.values(config.players);
                io.to(room).emit('players_update', playersArray);
                emitRoomConfig(room, config);
            }
        }
    });
});

// ✅ Inicializar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
