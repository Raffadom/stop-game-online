require('dotenv').config({ path: '../.env' });

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const admin = require('firebase-admin');
const { validateAnswer } = require('./validation-service');

// ✅ CORRIGIR: Inicialização do Firebase com modo de teste
let db;
const isTestMode = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

if (isTestMode) {
    console.log("🧪 Modo de teste detectado - executando sem Firebase");
    // Mock do Firestore para testes
    db = {
        collection: () => ({
            doc: () => ({
                get: () => Promise.resolve({ exists: false }),
                set: () => Promise.resolve(),
                update: () => Promise.resolve(),
                delete: () => Promise.resolve()
            }),
            add: () => Promise.resolve({ id: 'mock-id' }),
            get: () => Promise.resolve({ docs: [] })
        })
    };
} else {
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
        
        db = admin.firestore();
        
    } catch (e) {
        console.error("❌ Erro ao inicializar Firebase Admin SDK:", e);
        throw e;
    }
}

// Teste de conexão com o Firestore
async function testFirestore() {
    if (isTestMode) {
        console.log("✅ Modo de teste - pulando teste do Firestore");
        return;
    }
    
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

function normalizeValidationMode(mode) {
    return mode === 'automatic' ? 'automatic' : 'manual';
}

// ✅ MELHORAR: Função de salvar (garantir local correto)
async function saveRoomConfigToFirestore(roomId, config) {
    try {
        console.log(`[Firestore] 💾 Salvando sala ${roomId} em /rooms/...`);
        
        const docRef = roomsCollectionRef.doc(roomId);
        
        // ✅ Salvar configuração COMPLETA (SOBRESCREVER players)
        const configToSave = {
            themes: config.themes || [],
            duration: config.duration || 180,
            createdAt: config.createdAt || new Date(),
            creatorId: config.creatorId,
            players: config.players || {}, // ✅ Isso deve sobrescrever completamente
            isSaved: true,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'artifacts', // ✅ Marcar se foi migrada
            excludeXWYZ: config.excludeXWYZ || false, // ✅ NOVO: Salvar filtro de letras
            validationMode: normalizeValidationMode(config.validationMode),
            requireAccents: Boolean(config.requireAccents)
        };
        
        console.log(`[Firestore] 🔍 ANTES de salvar - Jogadores na configuração:`, Object.keys(config.players || {}));
        console.log(`[Firestore] 🔍 Salvando configuração com ${Object.keys(configToSave.players).length} jogadores`);
        
        // ✅ CRÍTICO: NÃO usar merge para garantir que players seja sobrescrito
        await docRef.set(configToSave);
        
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

// ✅ NOVA: Função para forçar limpeza de jogadores órfãos no Firestore
async function cleanOrphanPlayersFromFirestore(roomId, activePlayers) {
    try {
        console.log(`[Firestore] 🧹 Forçando limpeza de jogadores órfãos na sala ${roomId}`);
        
        const docRef = roomsCollectionRef.doc(roomId);
        
        // ✅ Atualizar apenas o campo players com a lista limpa
        await docRef.update({
            players: activePlayers,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`[Firestore] ✅ Jogadores órfãos limpos na sala ${roomId}. Restam: ${Object.keys(activePlayers).length}`);
        return true;
    } catch (error) {
        console.error(`[Firestore] ❌ Erro ao limpar jogadores órfãos da sala ${roomId}:`, error);
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

// ✅ NOVO: Letras excluídas por configuração
const EXCLUDED_LETTERS = ['X', 'W', 'Y', 'Z'];

// ✅ MELHORADO: Função para sortear letra sem repetição com filtros
function getRandomLetterForRoom(room, excludeXWYZ = false) {
    if (!roomLettersUsed.has(room)) {
        roomLettersUsed.set(room, []);
    }
    
    // ✅ NOVO: Aplicar filtro de letras baseado na configuração da sala
    let allowedLetters = [...ALL_LETTERS];
    if (excludeXWYZ) {
        allowedLetters = allowedLetters.filter(letter => !EXCLUDED_LETTERS.includes(letter));
    }
    
    const usedLetters = roomLettersUsed.get(room);
    const availableLetters = allowedLetters.filter(letter => !usedLetters.includes(letter));
    
    if (availableLetters.length === 0) {
        console.log(`[Letter System] Todas as letras foram usadas na sala ${room}. Reiniciando ciclo.`);
        roomLettersUsed.set(room, []);
        return getRandomLetterForRoom(room, excludeXWYZ);
    }
    
    const randomIndex = Math.floor(Math.random() * availableLetters.length);
    const selectedLetter = availableLetters[randomIndex];
    
    usedLetters.push(selectedLetter);
    roomLettersUsed.set(room, usedLetters);
    
    const totalAllowed = excludeXWYZ ? allowedLetters.length : ALL_LETTERS.length;
    console.log(`[Letter System] Sala ${room}: Letra '${selectedLetter}' sorteada. Filtro XWYZ: ${excludeXWYZ ? 'Ativo' : 'Inativo'}. Usadas: [${usedLetters.join(', ')}]. Restantes: ${totalAllowed - usedLetters.length}`);
    
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
            validationMode: 'manual',
            requireAccents: false,
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

            // ✅ NOVO: Usar filtro de letras da configuração da sala
            const letter = getRandomLetterForRoom(room, config.excludeXWYZ);
            
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
            validationMode: config.validationMode,
                roomId: room,
                updatedAt: new Date().toISOString()
            };
            
            saveValidationStateToFirestore(room, validationState);
            
            // ✅ Emitir próxima validação
            io.to(room).emit("start_validation", {
                ...nextItem,
                automatic: config.validationMode === 'automatic',
                validationMode: config.validationMode
            });

            if (config.validationMode === 'automatic') {
                processAutomaticValidation(room);
            }
        } else {
            console.log(`[Socket.io] 🏁 Completando validação para sala ${room}`);
            completeValidation(room);
        }
    } catch (error) {
        console.error('[Socket.io] Error in processNextValidation:', error);
    }
}

async function processAutomaticValidation(room) {
    const config = roomConfigs[room];
    if (!config || !config.validationQueue || !config.validationInProgress) return;

    const currentItem = config.validationQueue[config.currentValidation];
    if (!currentItem) {
        completeValidation(room);
        return;
    }

    const result = await validateAnswer({
        answer: currentItem.answer,
        letter: config.currentLetter,
        theme: currentItem.theme,
        requireAccents: Boolean(config.requireAccents)
    });

    const player = config.playersAnswers.find(item => item.playerId === currentItem.playerId);
    const themeIndex = config.themes.indexOf(currentItem.theme);
    const answer = player && themeIndex !== -1 ? player.answers[themeIndex] : null;

    if (answer) {
        answer.valid = result.status === 'valid';
        answer.validationStatus = result.status;
        answer.reason = result.reason;
    }

    io.to(room).emit("answer_validated", {
        valid: result.status === 'failed' ? null : result.status === 'valid',
        status: result.status,
        reason: result.reason,
        errorCode: result.errorCode,
        playerNickname: currentItem.playerNickname,
        answer: currentItem.answer,
        theme: currentItem.theme
    });

    setTimeout(() => processNextValidation(room), 200);
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

            if ([...normalizedAnswer].length < 2) {
                answer.points = 0;
                answer.valid = false;
                answer.reason = "Resposta deve ter pelo menos duas letras";
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

function emitRoundReview(room) {
    const config = roomConfigs[room];
    if (!config || !config.playersAnswers) return;

    io.to(room).emit('round_review_updated', {
        answers: config.playersAnswers,
        roundScores: config.roundScores || {}
    });
}

function recalculateRoundScores(room) {
    const config = roomConfigs[room];
    if (!config || !config.playersAnswers) return;

    const previousScores = config.roundScores || {};
    config.playersAnswers.forEach(player => {
        player.answers.forEach(answer => {
            answer.points = null;
        });
    });

    config.themes.forEach((theme, themeIndex) => {
        applyThemeScoring(room, themeIndex, config.playersAnswers, config.themes);
    });

    config.roundScores = {};
    config.playersAnswers.forEach(player => {
        const roundScore = player.answers.reduce((total, answer) => total + (answer.points || 0), 0);
        const previousRoundScore = previousScores[player.playerId] || 0;
        const delta = roundScore - previousRoundScore;
        config.roundScores[player.playerId] = roundScore;

        const playerConfig = config.players && config.players[player.playerId];
        if (playerConfig) {
            playerConfig.totalScore = (playerConfig.totalScore || 0) + delta;
        }

        const roomSockets = io.sockets.adapter.rooms.get(room);
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const playerSocket = io.sockets.sockets.get(socketId);
                if (playerSocket && playerSocket.userId === player.playerId) {
                    playerSocket.totalScore = (playerSocket.totalScore || 0) + delta;
                    playerSocket.emit('validation_complete_for_player', {
                        myScore: roundScore,
                        myTotalScore: playerSocket.totalScore,
                        myAnswers: player.answers.map(answer => ({
                            theme: answer.theme,
                            answer: answer.answer,
                            valid: answer.valid,
                            points: answer.points,
                            reason: answer.reason,
                            validated: true
                        }))
                    });
                    break;
                }
            }
        }
    });
}

function applyReviewStatus(room, playerId, theme, valid) {
    const config = roomConfigs[room];
    if (!config || !config.playersAnswers || typeof valid !== 'boolean') return false;

    const player = config.playersAnswers.find(item => item.playerId === playerId);
    const answer = player && player.answers.find(item => item.theme === theme);
    if (!answer) return false;

    answer.valid = valid;
    answer.validationStatus = valid ? 'valid' : 'invalid';
    answer.reason = valid ? 'Validada pelo administrador' : 'Invalidada pelo administrador';
    recalculateRoundScores(room);
    emitRoundReview(room);
    return true;
}

function finishVote(room) {
    const config = roomConfigs[room];
    const vote = config && config.activeVote;
    if (!vote) return;

    const validVotes = Object.values(vote.votes).filter(value => value === true).length;
    const invalidVotes = Object.values(vote.votes).filter(value => value === false).length;
    const player = config.playersAnswers.find(item => item.playerId === vote.playerId);
    const answer = player && player.answers.find(item => item.theme === vote.theme);
    const tie = validVotes === invalidVotes;
    const valid = tie ? answer && answer.valid === true : validVotes > invalidVotes;
    if (!tie) applyReviewStatus(room, vote.playerId, vote.theme, valid);

    io.to(room).emit('vote_finished', {
        playerId: vote.playerId,
        theme: vote.theme,
        valid,
        validVotes,
        invalidVotes,
        tie,
        totalVotes: validVotes + invalidVotes
    });
    clearTimeout(vote.timeoutId);
    delete config.activeVote;
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
        
        // ✅ Coletar respostas de todos os jogadores na sala (sockets + roomConfig persistidos)
        const allAnswers = [];
        const processedPlayerIds = new Set();
        
        // ✅ PRIMEIRO: Coletar de sockets ativos
        const roomSockets = io.sockets.adapter.rooms.get(room);
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const playerSocket = io.sockets.sockets.get(socketId);
                if (playerSocket && playerSocket.userId && playerSocket.submittedAnswers) {
                    console.log(`[Socket.io] 📝 Coletando respostas de ${playerSocket.nickname} (socket ativo):`, playerSocket.submittedAnswers);
                    
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
                    processedPlayerIds.add(playerSocket.userId);
                }
            }
        }
        
        // ✅ SEGUNDO: Verificar roomConfig para jogadores sem socket ativo mas com respostas persistidas
        if (config.players) {
            Object.values(config.players).forEach(player => {
                if (!processedPlayerIds.has(player.userId) && player.lastSubmittedAnswers) {
                    console.log(`[Socket.io] 📝 Coletando respostas de ${player.nickname} (roomConfig persistido):`, player.lastSubmittedAnswers);
                    
                    const playerAnswers = {
                        playerId: player.userId,
                        nickname: player.nickname,
                        answers: player.lastSubmittedAnswers.map(answer => ({
                            theme: answer.theme,
                            answer: answer.answer || "",
                            points: null,
                            reason: "",
                            valid: null
                        }))
                    };
                    
                    allAnswers.push(playerAnswers);
                    processedPlayerIds.add(player.userId);
                }
            });
        }
        
        console.log(`[Socket.io] 📊 Total de respostas coletadas: ${allAnswers.length}`);
        console.log(`[Socket.io] 👥 Jogadores incluídos na validação:`, allAnswers.map(p => `${p.nickname} (${p.playerId})`));
        
        // ✅ NOVO: Log de jogadores que podem ter sido excluídos
        if (config.players) {
            const allPlayerIds = Object.keys(config.players);
            const excludedPlayers = allPlayerIds.filter(playerId => !processedPlayerIds.has(playerId));
            if (excludedPlayers.length > 0) {
                console.log(`[Socket.io] ⚠️ Jogadores sem respostas (excluídos da validação):`, 
                    excludedPlayers.map(playerId => {
                        const player = config.players[playerId];
                        return `${player.nickname} (${playerId}) - Socket ativo: ${!!io.sockets.sockets.get(player.socketId)}, Respostas persistidas: ${!!player.lastSubmittedAnswers}`;
                    })
                );
            }
        }
        
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
        
        config.validationMode = normalizeValidationMode(config.validationMode);

        // ✅ Configurar estado de validação
        const validationState = {
            validationQueue: validationQueue,
            currentValidation: 0,
            validatorId: validatorId,
            playersAnswers: allAnswers,
            validationMode: config.validationMode,
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
        
        io.to(room).emit("start_validation", {
            ...firstItem,
            automatic: config.validationMode === 'automatic',
            validationMode: config.validationMode
        });

        if (config.validationMode === 'automatic') {
            processAutomaticValidation(room);
        }
        
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
        config.roundScores = {};
        
        // ✅ Enviar resultados individuais para cada jogador
        config.playersAnswers.forEach(player => {
            const roundScore = player.answers.reduce((total, answer) => {
                return total + (answer.points || 0);
            }, 0);
            config.roundScores[player.playerId] = roundScore;
            
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
                
                // ✅ NOVO: Persistir totalScore no roomConfig para preservar em reconexões
                const config = roomConfigs[room];
                if (config && config.players && config.players[player.playerId]) {
                    config.players[player.playerId].totalScore = playerSocket.totalScore;
                    console.log(`[Socket.io] 💾 TotalScore de ${player.nickname} salvo no roomConfig: ${playerSocket.totalScore}`);
                }
                
                console.log(`[Socket.io] 📊 Jogador ${player.nickname}: +${roundScore} pontos (Total: ${playerSocket.totalScore})`);
                
                // ✅ Enviar resultado individual
                playerSocket.emit("validation_complete_for_player", {
                    myScore: roundScore,
                    myTotalScore: playerSocket.totalScore,
                    myAnswers: player.answers.map(answer => ({
                        theme: answer.theme,
                        answer: answer.answer,
                        valid: answer.valid,
                        points: answer.points,
                        reason: answer.reason,
                        validated: true
                    }))
                });
            } else {
                // ✅ NOVO: Se o socket não existe mais, ainda persistir a pontuação no roomConfig
                const config = roomConfigs[room];
                if (config && config.players && config.players[player.playerId]) {
                    const currentTotal = config.players[player.playerId].totalScore || 0;
                    config.players[player.playerId].totalScore = currentTotal + roundScore;
                    console.log(`[Socket.io] 💾 TotalScore de ${player.nickname} (sem socket ativo) salvo no roomConfig: ${config.players[player.playerId].totalScore}`);
                    console.log(`[Socket.io] ⚠️ Jogador ${player.nickname} não tem socket ativo, mas pontuação foi preservada`);
                }
            }
        });
        
        console.log(`[Socket.io] ✅ Validação completada para sala ${room}`);
        
        // ✅ Limpar dados de validação
        delete config.validationQueue;
        delete config.currentValidation;
        delete config.validatorId;
        config.validationInProgress = false;
        config.reviewAvailable = true;
        
        // ✅ IMPORTANTE: Limpar estado do Firestore
        clearValidationStateFromFirestore(room);
        
        // ✅ Notificar que validação terminou
        io.to(room).emit("validation_complete", {
            message: "Validação completa!",
            allAnswers: config.playersAnswers,
            roundScores: config.roundScores
        });
        emitRoundReview(room);
        
    } catch (error) {
        console.error('[Socket.io] Error in completeValidation:', error);
    }
}

// ✅ Função para limpar jogadores desconectados há muito tempo (MOVIDA PARA ESCOPO GLOBAL)
function cleanupDisconnectedPlayers() {
    const CLEANUP_TIMEOUT = 30000; // 30 segundos
    const now = new Date();
    
    console.log(`[Socket.io] 🧹 Executando limpeza automática de jogadores desconectados...`);
    
    for (const [room, config] of Object.entries(roomConfigs)) {
        if (config && config.players) {
            const playersToRemove = [];
            
            Object.values(config.players).forEach(player => {
                if (player.disconnectedAt) {
                    const disconnectedTime = new Date(player.disconnectedAt);
                    const timeDiff = now - disconnectedTime;
                    
                    if (timeDiff > CLEANUP_TIMEOUT) {
                        playersToRemove.push(player.userId);
                        console.log(`[Socket.io] 🧹 Marcando ${player.nickname} (${player.userId}) para remoção - desconectado há ${Math.round(timeDiff/1000)}s`);
                    } else {
                        console.log(`[Socket.io] ⏰ ${player.nickname} desconectado há ${Math.round(timeDiff/1000)}s - aguardando...`);
                    }
                }
            });
            
            // Remover jogadores desconectados há muito tempo
            playersToRemove.forEach(userId => {
                const removedPlayer = config.players[userId];
                
                delete config.players[userId];
                
                const roomData = gameState.get(room);
                if (roomData && roomData.players) {
                    delete roomData.players[userId];
                }
                
                console.log(`[Socket.io] 🗑️ Jogador ${removedPlayer?.nickname || userId} removido definitivamente da sala ${room}`);
            });
            
            // Atualizar jogadores se houve remoções
            if (playersToRemove.length > 0) {
                const remainingPlayers = Object.values(config.players || {});
                
                if (remainingPlayers.length > 0) {
                    console.log(`[Socket.io] 📤 Atualizando lista de jogadores para sala ${room} - Restantes: ${remainingPlayers.length}`);
                    io.to(room).emit('players_update', remainingPlayers);
                    emitRoomConfig(room, config);
                } else {
                    // Sala vazia - limpar
                    delete roomConfigs[room];
                    console.log(`[Socket.io] 🗑️ Sala ${room} removida - sem jogadores ativos`);
                }
            }
        }
    }
    
    console.log(`[Socket.io] ✅ Limpeza automática concluída`);
}

// ✅ Executar limpeza periodicamente (APENAS UMA VEZ NO ESCOPO GLOBAL)
setInterval(cleanupDisconnectedPlayers, 60000); // A cada 1 minuto

// ✅ Mapa para controlar timeouts de transferência de admin (MOVIDO PARA ESCOPO GLOBAL)
const adminTransferTimeouts = new Map();

// ✅ Função para transferir admin para o próximo jogador disponível (MOVIDA PARA ESCOPO GLOBAL)
function transferAdminRole(room) {
    const config = roomConfigs[room];
    if (!config || !config.players) return null;

    const players = Object.values(config.players);
    
    // Se não há jogadores, limpar a sala
    if (players.length === 0) {
        console.log(`[Socket.io] 🗑️ Sala ${room} vazia - limpando configurações`);
        delete roomConfigs[room];
        return null;
    }

    // Encontrar o jogador mais antigo para ser o novo admin
    const sortedPlayers = players.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
    const newAdmin = sortedPlayers[0];
    
    // Atualizar creatorId e isCreator
    const oldCreatorId = config.creatorId;
    config.creatorId = newAdmin.userId;
    
    // Atualizar todos os jogadores
    Object.values(config.players).forEach(player => {
        player.isCreator = (player.userId === newAdmin.userId);
    });
    
    console.log(`[Socket.io] 👑 Admin transferido na sala ${room}: ${oldCreatorId} -> ${newAdmin.userId} (${newAdmin.nickname})`);
    
    return newAdmin;
}

// ✅ Função para cancelar transferência de admin pendente (MOVIDA PARA ESCOPO GLOBAL)
function cancelAdminTransfer(room) {
    if (adminTransferTimeouts.has(room)) {
        clearTimeout(adminTransferTimeouts.get(room));
        adminTransferTimeouts.delete(room);
        console.log(`[Socket.io] ⏹️ Transferência de admin cancelada para sala ${room}`);
        return true;
    }
    return false;
}

// ✅ Função para agendar transferência de admin com delay (MOVIDA PARA ESCOPO GLOBAL)
function scheduleAdminTransfer(room, disconnectedUserId, disconnectedNickname) {
    const TRANSFER_DELAY = 5000; // 5 segundos
    
    console.log(`[Socket.io] ⏰ Agendando transferência de admin em ${TRANSFER_DELAY}ms para sala ${room}`);
    
    const timeout = setTimeout(() => {
        console.log(`[Socket.io] ⏰ Executando transferência de admin agendada para sala ${room}`);
        
        const config = roomConfigs[room];
        if (config && config.creatorId === disconnectedUserId) {
            const newAdmin = transferAdminRole(room);
            if (newAdmin) {
                console.log(`[Socket.io] 👑 Novo admin após delay na sala ${room}: ${newAdmin.nickname}`);
                
                // Atualizar jogadores restantes
                const remainingPlayers = Object.values(config.players || {});
                if (remainingPlayers.length > 0) {
                    io.to(room).emit('players_update', remainingPlayers);
                    emitRoomConfig(room, config);
                }
            }
        }
        
        adminTransferTimeouts.delete(room);
    }, TRANSFER_DELAY);
    
    adminTransferTimeouts.set(room, timeout);
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
                    
                    // ✅ CRÍTICO: Verificar se jogadores salvos ainda estão conectados
                    const savedPlayers = savedConfig.players || {};
                    const currentTime = Date.now();
                    const MAX_DISCONNECT_TIME = 2 * 60 * 1000; // 2 minutos (reduzido)
                    
                    // Filtrar apenas jogadores que ainda podem estar conectados
                    const activePlayers = {};
                    let removedPlayersCount = 0;
                    
                    console.log(`[Socket.io] 🔍 Verificando ${Object.keys(savedPlayers).length} jogadores salvos na sala ${room}`);
                    
                    Object.entries(savedPlayers).forEach(([playerId, player]) => {
                        // ✅ MELHOR: Verificar se socket realmente existe e está conectado
                        const socketExists = io.sockets.sockets.has(player.socketId);
                        const disconnectTime = player.disconnectedAt ? (currentTime - new Date(player.disconnectedAt).getTime()) : 0;
                        const isRecentlyDisconnected = player.disconnectedAt && disconnectTime < MAX_DISCONNECT_TIME;
                        
                        console.log(`[Socket.io] 🔍 Verificando ${player.nickname}:`, {
                            socketId: player.socketId,
                            socketExists,
                            disconnectedAt: player.disconnectedAt,
                            disconnectTime: Math.round(disconnectTime / 1000) + 's',
                            isRecentlyDisconnected
                        });
                        
                        // ✅ APENAS manter se socket existe OU se desconectou recentemente
                        if (socketExists || isRecentlyDisconnected) {
                            activePlayers[playerId] = player;
                            console.log(`[Socket.io] ✅ Mantendo jogador ${player.nickname} (socket existe: ${socketExists}, recentemente desconectado: ${isRecentlyDisconnected})`);
                        } else {
                            removedPlayersCount++;
                            console.log(`[Socket.io] 🗑️ Removendo jogador órfão ${player.nickname} (sem socket ativo há ${Math.round(disconnectTime / 1000)}s)`);
                        }
                    });
                    
                    if (removedPlayersCount > 0) {
                        console.log(`[Socket.io] 🧹 ${removedPlayersCount} jogadores órfãos removidos da sala ${room}`);
                        
                        // ✅ CRÍTICO: Forçar limpeza no Firestore imediatamente
                        try {
                            await cleanOrphanPlayersFromFirestore(room, activePlayers);
                        } catch (error) {
                            console.error(`[Socket.io] ❌ Erro ao limpar órfãos do Firestore:`, error);
                        }
                    }
                    
                    // ✅ Usar configuração salva do Firestore com jogadores limpos
                    roomConfig = {
                        ...savedConfig,
                        players: activePlayers, // ✅ Apenas jogadores ativos
                        roundActive: false,
                        roundEnded: false,
                        currentLetter: '',
                        validationInProgress: false,
                        excludeXWYZ: savedConfig.excludeXWYZ || false, // ✅ NOVO: Filtro de letras
                        validationMode: normalizeValidationMode(savedConfig.validationMode),
                        requireAccents: Boolean(savedConfig.requireAccents)
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
                        validationInProgress: false,
                        excludeXWYZ: false, // ✅ NOVO: Por padrão, incluir todas as letras
                        validationMode: 'manual',
                        requireAccents: false
                    };
                    
                    roomConfigs[room] = roomConfig;
                }
            }

            // ✅ RESTAURAR: Estado de validação se existir (mas validar jogadores órfãos)
            if (savedValidationState) {
                console.log(`[Socket.io] 🎯 Validando estado de validação salvo...`);
                
                const currentPlayerIds = Object.keys(roomConfig.players || {});
                const validationPlayerIds = [...new Set(savedValidationState.validationQueue?.map(item => item.playerId) || [])];
                const validatorExists = currentPlayerIds.includes(savedValidationState.validatorId);
                const playersExist = validationPlayerIds.some(playerId => currentPlayerIds.includes(playerId));
                
                if (validatorExists && playersExist) {
                    console.log(`[Socket.io] ✅ Estado de validação válido - restaurando...`);
                    
                    roomConfig.validationQueue = savedValidationState.validationQueue;
                    roomConfig.currentValidation = savedValidationState.currentValidation;
                    roomConfig.validatorId = savedValidationState.validatorId;
                    roomConfig.playersAnswers = savedValidationState.playersAnswers;
                    roomConfig.validationInProgress = true;
                    roomConfig.validationMode = normalizeValidationMode(savedValidationState.validationMode || roomConfig.validationMode);
                } else {
                    console.log(`[Socket.io] 🗑️ Estado de validação órfão detectado - limpando...`);
                    console.log(`[Socket.io] - Validador existe: ${validatorExists}, Jogadores existem: ${playersExist}`);
                    
                    // Limpar validação órfã do Firestore
                    try {
                        await clearValidationStateFromFirestore(room);
                        console.log(`[Socket.io] ✅ Validação órfã removida do Firestore`);
                    } catch (error) {
                        console.error(`[Socket.io] ❌ Erro ao limpar validação órfã do Firestore:`, error);
                    }
                }
            }

            // ✅ IMPORTANTE: Sincronizar gameState com roomConfig (com jogadores limpos)
            if (!gameState.has(room)) {
                gameState.set(room, {
                    players: roomConfig.players || {}, // ✅ Já contém apenas jogadores ativos
                    themes: roomConfig.themes,
                    duration: roomConfig.duration,
                    createdAt: roomConfig.createdAt,
                    validationInProgress: roomConfig.validationInProgress || false
                });
                console.log(`[Socket.io] 🆕 GameState criado para sala ${room} com ${Object.keys(roomConfig.players || {}).length} jogadores ativos`);
            } else {
                // ✅ Atualizar gameState existente com dados salvos (limpos)
                const roomData = gameState.get(room);
                roomData.players = roomConfig.players || {}; // ✅ Sobrescrever com jogadores limpos
                roomData.themes = roomConfig.themes;
                roomData.duration = roomConfig.duration;
                roomData.validationInProgress = roomConfig.validationInProgress || false;
                console.log(`[Socket.io] 🔄 GameState atualizado para sala ${room} com ${Object.keys(roomConfig.players || {}).length} jogadores ativos`);
            }
            
            const roomData = gameState.get(room);

            // ✅ Verificar se é reconexão
            if (isReconnecting) {
                console.log(`[Socket.io] 🔄 Processando reconexão para ${nickname}`);
                
                // ✅ Verificar se jogador existe nos dados salvos
                const existingPlayer = Object.values(roomConfig.players || {}).find(p => p.userId === userId);
                
                if (existingPlayer) {
                    console.log(`[Socket.io] ✅ Jogador encontrado nos dados salvos - reconectando`);
                    
                    // ✅ Cancelar transferência de admin pendente se for admin reconectando
                    if (existingPlayer.isCreator) {
                        const cancelled = cancelAdminTransfer(room);
                        if (cancelled) {
                            console.log(`[Socket.io] 👑 Admin ${nickname} reconectou - mantendo status de admin`);
                        }
                    }
                    
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
                    
                    // ✅ NOVO: Restaurar totalScore e submittedAnswers persistidos
                    if (existingPlayer.totalScore) {
                        socket.totalScore = existingPlayer.totalScore;
                        console.log(`[Socket.io] 🔄 TotalScore restaurado para ${nickname}: ${socket.totalScore}`);
                    }
                    if (existingPlayer.lastSubmittedAnswers) {
                        socket.submittedAnswers = existingPlayer.lastSubmittedAnswers;
                        console.log(`[Socket.io] 🔄 SubmittedAnswers restauradas para ${nickname}`);
                    }
                    
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
                    validationMode: normalizeValidationMode(roomConfig.validationMode),
                        requireAccents: Boolean(roomConfig.requireAccents),
                        createdAt: roomConfig.createdAt,
                        creatorId: roomConfig.creatorId
                    });
                    if (roomConfig.reviewAvailable && roomConfig.playersAnswers) {
                        socket.emit('round_review_updated', {
                            answers: roomConfig.playersAnswers,
                            roundScores: roomConfig.roundScores || {}
                        });
                    }
                    
                    // ✅ Verificar se validação ainda é válida na reconexão
                    if (roomConfig.validationInProgress && roomConfig.validationQueue) {
                        const currentPlayers = Object.keys(roomConfig.players);
                        const validationPlayerIds = [...new Set(roomConfig.validationQueue.map(item => item.playerId))];
                        const validatorExists = currentPlayers.includes(roomConfig.validatorId);
                        const playersExist = validationPlayerIds.some(playerId => currentPlayers.includes(playerId));
                        
                        if (!validatorExists || !playersExist) {
                            console.log(`[Socket.io] 🗑️ Validação órfã detectada na reconexão - limpando...`);
                            
                            // Limpar validação órfã
                            roomConfig.validationInProgress = false;
                            delete roomConfig.validationQueue;
                            delete roomConfig.currentValidation;
                            delete roomConfig.validatorId;
                            delete roomConfig.playersAnswers;
                            
                            // Limpar do Firestore
                            try {
                                await clearValidationStateFromFirestore(room);
                                console.log(`[Socket.io] ✅ Validação órfã removida do Firestore (reconexão)`);
                            } catch (error) {
                                console.error(`[Socket.io] ❌ Erro ao limpar validação órfã do Firestore (reconexão):`, error);
                            }
                        } else {
                            console.log(`[Socket.io] 🎯 Retomando validação em progresso`);
                            
                            const currentItem = roomConfig.validationQueue[roomConfig.currentValidation];
                            if (currentItem) {
                                console.log(`[Socket.io] ✅ Enviando item atual de validação:`, currentItem);
                                io.to(room).emit("start_validation", currentItem);
                            }
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
                
                // ✅ NOVO: Restaurar totalScore e submittedAnswers persistidos
                if (existingPlayer.totalScore) {
                    socket.totalScore = existingPlayer.totalScore;
                    console.log(`[Socket.io] 🔄 TotalScore restaurado para ${nickname}: ${socket.totalScore}`);
                }
                if (existingPlayer.lastSubmittedAnswers) {
                    socket.submittedAnswers = existingPlayer.lastSubmittedAnswers;
                    console.log(`[Socket.io] 🔄 SubmittedAnswers restauradas para ${nickname}`);
                }
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

                // ✅ IMPORTANTE: Verificar se precisa definir novo admin
                const currentCreatorExists = roomConfig.creatorId && roomConfig.players[roomConfig.creatorId];
                
                if (!roomConfig.creatorId || !currentCreatorExists || Object.keys(roomConfig.players).length === 1) {
                    roomConfig.creatorId = userId;
                    newPlayer.isCreator = true;
                    
                    // Remover isCreator de outros jogadores
                    Object.values(roomConfig.players).forEach(player => {
                        if (player.userId !== userId) {
                            player.isCreator = false;
                        }
                    });
                    
                    console.log(`[Socket.io] 👑 ${nickname} definido como admin da sala ${room} (criador anterior não existe ou sala vazia)`);
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
                        validationMode: normalizeValidationMode(roomConfig.validationMode),
                        requireAccents: Boolean(roomConfig.requireAccents),
                createdAt: roomConfig.createdAt,
                creatorId: roomConfig.creatorId
            });
            if (roomConfig.reviewAvailable && roomConfig.playersAnswers) {
                socket.emit('round_review_updated', {
                    answers: roomConfig.playersAnswers,
                    roundScores: roomConfig.roundScores || {}
                });
            }

            socket.to(room).emit("players_update", allPlayers);
            
            console.log(`[Socket.io] ✅ ${nickname} entrou na sala ${room} com sucesso`);
            console.log(`[Socket.io] 📊 Configuração atual:`, {
                themes: roomConfig.themes?.length || 0,
                duration: roomConfig.duration,
                isSaved: roomConfig.isSaved
            });

            // ✅ Verificar se há validação órfã (com jogadores que não estão mais na sala)
            if (roomConfig.validationInProgress && roomConfig.validationQueue) {
                const currentPlayers = Object.keys(roomConfig.players);
                const validationPlayerIds = [...new Set(roomConfig.validationQueue.map(item => item.playerId))];
                const validatorExists = currentPlayers.includes(roomConfig.validatorId);
                const playersExist = validationPlayerIds.some(playerId => currentPlayers.includes(playerId));
                
                if (!validatorExists || !playersExist) {
                    console.log(`[Socket.io] 🗑️ Validação órfã detectada - limpando...`);
                    console.log(`[Socket.io] - Validador ${roomConfig.validatorId} existe: ${validatorExists}`);
                    console.log(`[Socket.io] - Jogadores da validação existem: ${playersExist}`);
                    console.log(`[Socket.io] - Jogadores atuais: ${currentPlayers}`);
                    console.log(`[Socket.io] - Jogadores da validação: ${validationPlayerIds}`);
                    
                    // Limpar validação órfã
                    roomConfig.validationInProgress = false;
                    delete roomConfig.validationQueue;
                    delete roomConfig.currentValidation;
                    delete roomConfig.validatorId;
                    delete roomConfig.playersAnswers;
                    
                    // Limpar do Firestore
                    try {
                        await clearValidationStateFromFirestore(room);
                        console.log(`[Socket.io] ✅ Validação órfã removida do Firestore`);
                    } catch (error) {
                        console.error(`[Socket.io] ❌ Erro ao limpar validação órfã do Firestore:`, error);
                    }
                } else {
                    console.log(`[Socket.io] 🎯 Enviando estado atual de validação para novo jogador`);
                    
                    const currentItem = roomConfig.validationQueue[roomConfig.currentValidation];
                    if (currentItem) {
                        socket.emit("start_validation", currentItem);
                    }
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

    // ✅ NOVO: Handler para atualizar filtro de letras
    socket.on('update_letter_filter', async ({ room, excludeXWYZ }) => {
        try {
            const config = roomConfigs[room];
            if (!config || socket.userId !== config.creatorId) {
                console.log(`[Socket.io] ❌ Tentativa não autorizada de alterar filtro de letras por ${socket.userId}`);
                return;
            }

            config.excludeXWYZ = Boolean(excludeXWYZ);
            config.isSaved = false;
            
            // ✅ Limpar letras usadas quando filtro muda para evitar inconsistências
            clearRoomLetters(room);
            
            io.to(room).emit('letter_filter_updated', { excludeXWYZ: config.excludeXWYZ });
            emitRoomConfig(room, config);
            
            console.log(`[Socket.io] ✅ Filtro de letras atualizado para sala ${room}. Excluir XWYZ: ${config.excludeXWYZ}`);
        } catch (error) {
            console.error('[Socket.io] ❌ Erro ao atualizar filtro de letras:', error);
        }
    });

    socket.on('update_validation_mode', ({ room, validationMode }) => {
        const config = roomConfigs[room];
        if (!config || socket.userId !== config.creatorId || config.roundActive || config.validationInProgress) {
            socket.emit('room_error', { message: 'O modo de correção só pode ser alterado pelo administrador antes da rodada' });
            return;
        }

        config.validationMode = normalizeValidationMode(validationMode);
        config.isSaved = false;
        emitRoomConfig(room, config);
    });

    socket.on('update_accent_rule', ({ room, requireAccents }) => {
        const config = roomConfigs[room];
        if (!config || socket.userId !== config.creatorId || config.roundActive || config.validationInProgress) {
            socket.emit('room_error', { message: 'A regra de acentos só pode ser alterada pelo administrador antes da rodada' });
            return;
        }

        config.requireAccents = Boolean(requireAccents);
        config.isSaved = false;
        emitRoomConfig(room, config);
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
            
            // ✅ Salvar no socket (comportamento original)
            socket.submittedAnswers = answers;
            
            // ✅ NOVO: Persistir também no roomConfig para preservar em reconexões
            const config = roomConfigs[room];
            if (config && config.players && config.players[socket.userId]) {
                config.players[socket.userId].lastSubmittedAnswers = answers;
                config.players[socket.userId].submittedAt = new Date();
                console.log(`[Socket.io] 💾 Respostas de ${socket.nickname} salvas no roomConfig para preservar em reconexões`);
            }
            
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

    socket.on('review_answer', ({ room, playerId, theme, valid }) => {
        const config = roomConfigs[room];
        if (!config || socket.userId !== config.creatorId || !config.reviewAvailable) {
            socket.emit('room_error', { message: 'Apenas o administrador pode revisar respostas após a correção' });
            return;
        }

        if (!applyReviewStatus(room, playerId, theme, valid)) {
            socket.emit('room_error', { message: 'Resposta não encontrada para revisão' });
        }
    });

    socket.on('open_answer_vote', ({ room, playerId, theme }) => {
        const config = roomConfigs[room];
        if (!config || socket.userId !== config.creatorId || !config.reviewAvailable) {
            socket.emit('room_error', { message: 'A votação só pode ser aberta pelo administrador após a correção' });
            return;
        }

        if (config.activeVote) {
            socket.emit('room_error', { message: 'Já existe uma votação em andamento' });
            return;
        }

        const player = config.playersAnswers.find(item => item.playerId === playerId);
        const answer = player && player.answers.find(item => item.theme === theme);
        if (!answer) {
            socket.emit('room_error', { message: 'Resposta não encontrada para votação' });
            return;
        }

        const endsAt = Date.now() + 15000;
        const timeoutId = setTimeout(() => finishVote(room), 15000);
        config.activeVote = { playerId, playerNickname: player.nickname, theme, answer: answer.answer, votes: {}, endsAt, timeoutId };
        io.to(room).emit('vote_opened', {
            playerId,
            playerNickname: player.nickname,
            theme,
            answer: answer.answer,
            endsAt,
            durationSeconds: 15
        });
    });

    socket.on('cast_answer_vote', ({ room, valid }) => {
        const config = roomConfigs[room];
        if (!config || !config.activeVote || typeof valid !== 'boolean' || !socket.userId) return;

        config.activeVote.votes[socket.userId] = valid;
        const voters = Object.keys(config.players || {});
        const answered = Object.keys(config.activeVote.votes).filter(userId => voters.includes(userId)).length;
        if (answered >= voters.length) finishVote(room);
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
            delete config.roundScores;
            delete config.reviewAvailable;
            if (config.activeVote) {
                clearTimeout(config.activeVote.timeoutId);
                delete config.activeVote;
            }
            
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

            if (config.validationInProgress) {
                socket.emit('room_error', { message: 'Aguarde a conclusão da correção antes de encerrar a partida' });
                return;
            }

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
                validationInProgress: config.validationInProgress || false,
                validationMode: normalizeValidationMode(config.validationMode),
                requireAccents: Boolean(config.requireAccents)
            });
        }
    });

    // ✅ Handler para saída voluntária da sala
    socket.on('leave_room', async ({ userId, room }) => {
        try {
            const targetUserId = userId || socket.userId;
            const targetRoom = room || socket.roomId;
            
            console.log(`[Socket.io] 🚪 LEAVE_ROOM: Jogador ${targetUserId} saindo da sala ${targetRoom}`);
            
            if (!targetRoom || !targetUserId) {
                console.log(`[Socket.io] ❌ LEAVE_ROOM: Dados insuficientes - userId: ${targetUserId}, room: ${targetRoom}`);
                return;
            }

            const config = roomConfigs[targetRoom];
            if (!config) {
                console.log(`[Socket.io] ❌ LEAVE_ROOM: Sala ${targetRoom} não existe em roomConfigs`);
                return;
            }
            
            if (!config.players) {
                console.log(`[Socket.io] ❌ LEAVE_ROOM: Sala ${targetRoom} não tem lista de jogadores`);
                return;
            }
            
            // Verificar se jogador realmente existe na sala
            const playerExists = config.players[targetUserId];
            if (!playerExists) {
                console.log(`[Socket.io] ⚠️ LEAVE_ROOM: Jogador ${targetUserId} não está na sala ${targetRoom}`);
                return;
            }
            
            const wasAdmin = (config.creatorId === targetUserId);
            const playerNickname = playerExists.nickname;
            
            console.log(`[Socket.io] 👤 LEAVE_ROOM: ${playerNickname} (admin: ${wasAdmin}) saindo definitivamente`);
            
            // ✅ Cancelar transferência de admin pendente (saída voluntária é definitiva)
            if (wasAdmin) {
                cancelAdminTransfer(targetRoom);
            }
            
            // Remover jogador da sala
            delete config.players[targetUserId];
            
            // Se for gameState, também remover de lá
            const roomData = gameState.get(targetRoom);
            if (roomData && roomData.players) {
                delete roomData.players[targetUserId];
            }
            
            // ✅ CRÍTICO: Salvar configuração atualizada no Firestore (sem o jogador)
            console.log(`[Socket.io] 💾 LEAVE_ROOM: Salvando configuração após remover ${playerNickname}. Jogadores restantes:`, Object.keys(config.players));
            try {
                const saved = await saveRoomConfigToFirestore(targetRoom, config);
                if (saved) {
                    console.log(`[Socket.io] ✅ LEAVE_ROOM: ${playerNickname} removido do Firestore com sucesso`);
                } else {
                    console.error(`[Socket.io] ❌ LEAVE_ROOM: Falha ao salvar configuração no Firestore`);
                }
            } catch (error) {
                console.error(`[Socket.io] ❌ LEAVE_ROOM: Erro ao salvar configuração no Firestore:`, error);
            }
            
            // Deixar o socket room
            socket.leave(targetRoom);
            
            // Limpar dados do socket
            socket.roomId = null;
            
            // Se era admin e ainda há jogadores, transferir admin IMEDIATAMENTE
            if (wasAdmin) {
                const newAdmin = transferAdminRole(targetRoom);
                if (newAdmin) {
                    console.log(`[Socket.io] 👑 LEAVE_ROOM: Novo admin na sala ${targetRoom}: ${newAdmin.nickname}`);
                } else {
                    console.log(`[Socket.io] 🗑️ LEAVE_ROOM: Sala ${targetRoom} vazia após saída do admin`);
                }
            }
            
            // Atualizar todos os jogadores restantes
            const remainingPlayers = Object.values(config.players || {});
            console.log(`[Socket.io] 📊 LEAVE_ROOM: Jogadores restantes na sala ${targetRoom}:`, remainingPlayers.map(p => p.nickname));
            
            if (remainingPlayers.length > 0) {
                io.to(targetRoom).emit('players_update', remainingPlayers);
                emitRoomConfig(targetRoom, config);
                console.log(`[Socket.io] 📤 LEAVE_ROOM: Lista de jogadores atualizada para sala ${targetRoom}`);
            } else {
                console.log(`[Socket.io] 🗑️ LEAVE_ROOM: Sala ${targetRoom} vazia - será limpa pela função de cleanup`);
            }
            
            console.log(`[Socket.io] ✅ LEAVE_ROOM: ${playerNickname} removido com sucesso. Restantes: ${remainingPlayers.length}`);
            
        } catch (error) {
            console.error('[Socket.io] ❌ Erro no leave_room:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] Desconexão: ${socket.id} (userId: ${socket.userId})`);
        
        if (socket.userId && socket.roomId) {
            const room = socket.roomId;
            const config = roomConfigs[room];
            
            if (config && config.players) {
                const wasAdmin = (config.creatorId === socket.userId);
                const playerNickname = socket.nickname;
                
                // ⚠️ NÃO remover jogador da sala imediatamente - marcar como desconectado
                if (config.players[socket.userId]) {
                    config.players[socket.userId].disconnectedAt = new Date();
                    config.players[socket.userId].socketId = null;
                }
                
                // Se for gameState, marcar desconexão
                const roomData = gameState.get(room);
                if (roomData && roomData.players && roomData.players[socket.userId]) {
                    roomData.players[socket.userId].disconnectedAt = new Date();
                    roomData.players[socket.userId].socketId = null;
                }
                
                // Se era admin, agendar transferência com delay
                if (wasAdmin) {
                    scheduleAdminTransfer(room, socket.userId, playerNickname);
                }
                
                // Atualizar lista de jogadores (mostrar como desconectado)
                const allPlayers = Object.values(config.players || {});
                io.to(room).emit('players_update', allPlayers);
                
                console.log(`[Socket.io] ⏸️ Jogador ${playerNickname} desconectado temporariamente. Admin será transferido em 5s se não reconectar.`);
            }
        }
    });
});

// ✅ Inicializar servidor
const PORT = process.env.PORT || 3001;
const isCIMode = process.env.NODE_ENV === 'ci';

if (!isTestMode || isCIMode) {
    server.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
        if (isCIMode) {
            console.log(`🔧 Modo CI ativo - servidor forçado a iniciar`);
        }
    });
} else {
    console.log('🧪 Test mode - servidor não iniciou listen automaticamente');
}

// Exportar objetos e funções para permitir testes de integração
module.exports = {
    app,
    server,
    io,
    roomConfigs,
    gameState,
    startValidationProcess,
    completeValidation,
    applyThemeScoring
};
