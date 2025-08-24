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
const roomsAnswers = {};
const stopCallers = {};
const validationStates = {};
const roomConfigs = {};
const roomOverallScores = {}; // Overall scores for the entire game
const playerDisconnectionTimers = {}; // Mantenha um mapa de temporizadores de desconexão para admins

// ------------------------
// Helpers
// ------------------------
function getRandomLetter() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function generateUserId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function initiateValidationProcess(room) {
    try {
        const config = roomConfigs[room];
        if (!config) {
            console.log(`[Socket.io] ❌ Não foi possível iniciar a validação: Config da sala ${room} não encontrada.`);
            return;
        }

        const currentThemes = Array.isArray(config.themes) ? config.themes : [];
        const totalThemes = currentThemes.length;

        const playersInRoom = Object.values(players).filter((p) => p.room === room);
        const totalPlayers = playersInRoom.length;

        if (!roomsAnswers[room]) roomsAnswers[room] = [];

        // Ensure all players in the room have an entry in roomsAnswers with all themes
        playersInRoom.forEach(p => {
            const playerAnswersIndex = roomsAnswers[room].findIndex(r => r.id === p.userId);
            if (playerAnswersIndex === -1) {
                console.log(`[Socket.io] Jogador ${p.nickname} não submeteu respostas. Preenchendo com vazios para ${totalThemes} temas.`);
                roomsAnswers[room].push({
                    id: p.userId,
                    nickname: p.nickname,
                    answers: currentThemes.map(theme => ({ theme, answer: "", points: null, validated: false }))
                });
            } else {
                const playerAnswers = roomsAnswers[room][playerAnswersIndex];
                // Ensure existing players have all current themes and default answer state
                playerAnswers.answers = currentThemes.map(theme => {
                    const existingAnswer = playerAnswers.answers.find(a => a.theme === theme);
                    return existingAnswer || { theme, answer: "", points: null, validated: false };
                });
            }
        });

        // Sort players for consistent validation order (stop caller first)
        const orderedPlayersAnswers = [...roomsAnswers[room]].sort((a, b) => {
            if (stopCallers[room] === a.id) return -1;
            if (stopCallers[room] === b.id) return 1;
            return 0;
        });
        roomsAnswers[room] = orderedPlayersAnswers;

        if (totalPlayers === 0 || totalThemes === 0) {
            console.log(`[Socket.io] Não há jogadores ou temas para validar na sala ${room}.`);
            io.to(room).emit("all_answers_validated", []);
            return;
        }

        // Determine who is the judge for this validation round
        const initialValidatorId = stopCallers[room] || roomsAnswers[room][0].id;

        validationStates[room] = {
            currentPlayerIndex: 0,
            currentThemeIndex: 0,
            validatorId: initialValidatorId,
            roundLetter: config.currentLetter,
        };

        const currentPlayer = roomsAnswers[room][validationStates[room].currentPlayerIndex];
        const currentThemeData = currentPlayer.answers[validationStates[room].currentThemeIndex] || { 
            theme: config.themes[validationStates[room].currentThemeIndex], 
            answer: "", 
            points: null,
            validated: false // Default to false if not present
        };
        const validatorSocketId = players[validationStates[room].validatorId]?.id;

        const isLastPlayerOfThemeInitial = validationStates[room].currentPlayerIndex === totalPlayers - 1;
        const isLastThemeOfGameInitial = validationStates[room].currentThemeIndex === totalThemes - 1;

        console.log(`[Socket.io] 🚀 Iniciando validação para sala ${room}. Juiz: ${players[validationStates[room].validatorId]?.nickname} (ID: ${initialValidatorId}).`);
        io.to(room).emit("start_validation", {
            current: {
                playerId: currentPlayer.id,
                playerNickname: currentPlayer.nickname,
                themeIndex: validationStates[room].currentThemeIndex,
                theme: currentThemeData.theme,
                answer: currentThemeData.answer,
                validated: currentThemeData.validated, // Ensure this is sent
                isLastAnswerOfTheme: isLastPlayerOfThemeInitial,
                isLastAnswerOfGame: isLastPlayerOfThemeInitial && isLastThemeOfGameInitial,
            },
            judgeId: validatorSocketId,
        });
    } catch (error) {
        console.error(`[Socket.io] Erro em initiateValidationProcess para sala ${room}:`, error);
    }
}

function initiateValidationAfterDelay(room) {
    if (!room) {
        console.warn(`[Socket.io] initiateValidationAfterDelay: Sala indefinida. Não pode agendar validação.`);
        return;
    }
    const submissionGracePeriodMs = 1500;
    console.log(`[Socket.io] Aguardando ${submissionGracePeriodMs}ms antes de iniciar a validação na sala ${room}...`);
    setTimeout(() => {
        initiateValidationProcess(room);
    }, submissionGracePeriodMs);
}

// ------------------------
// Eventos Socket.IO
// ------------------------
io.on("connection", (socket) => {
    // Nota: socket.userId é temporário aqui. O userId real vem do cliente nas chamadas de join/rejoin.
    socket.userId = generateUserId();
    socket.room = null;
    console.log(`[Socket.io] Nova conexão. Socket ID: ${socket.id}, userId: ${socket.userId}`);

    // --- Tratamento de desconexão ---
    socket.on("disconnect", async () => {
        const userId = socket.userId;
        const room = socket.room;
        console.log(`[Socket.io] Socket desconectado. Socket ID: ${socket.id}, userId: ${userId}, Sala: ${room}`);

        if (!room || !userId) {
            return;
        }

        // Obtém o objeto do jogador desconectado antes de deletar
        const playerDisconnected = players[userId];
        delete players[userId];

        const roomConfig = roomConfigs[room];

        // Se o jogador que desconectou era o criador da sala E essa sala existe
        // E NÃO é uma saída explícita (leave_room já cuida da promoção)
        if (roomConfig && roomConfig.creatorId === userId) {
            console.log(`[Socket.io] Admin ${userId} da sala ${room} desconectou. Iniciando temporizador para possível reconexão.`);

            // Limpa qualquer temporizador anterior para este admin
            if (playerDisconnectionTimers[userId]) {
                clearTimeout(playerDisconnectionTimers[userId]);
                delete playerDisconnectionTimers[userId];
            }

            // Cria um temporizador para lidar com reconexões ou promoção de novo admin
            playerDisconnectionTimers[userId] = setTimeout(async () => {
                // Se o temporizador expirar, o admin não reconectou.
                const remainingPlayers = Object.values(players).filter(p => p.room === room);

                // Se ainda há jogadores na sala e o admin original não reconectou
                if (remainingPlayers.length > 0) {
                    // Promove o próximo jogador a admin (o primeiro da lista de remainingPlayers)
                    const newAdmin = remainingPlayers[0];
                    roomConfig.creatorId = newAdmin.userId;
                    newAdmin.isCreator = true; // Marca o novo admin no objeto do jogador em memória

                    await saveRoomConfigToFirestore(room, roomConfig); // Salva a mudança no Firestore
                    emitRoomConfig(room, roomConfig); // Notifica todos na sala com a nova config

                    // Atualiza a lista de jogadores para todos na sala para refletir o novo admin
                    io.to(room).emit("players_update", remainingPlayers.map(p => ({
                        id: p.id,
                        nickname: p.nickname,
                        userId: p.userId,
                        isCreator: p.isCreator
                    })));
                    console.log(`[Socket.io] Admin ${userId} não reconectou. ${newAdmin.nickname} (${newAdmin.userId}) é o novo admin da sala ${room}.`);
                } else {
                    // Se não houver mais ninguém na sala, e o admin original não reconectou, a sala pode ser considerada vazia/inativa
                    console.log(`[Socket.io] Sala ${room} agora vazia após desconexão do admin ${userId}.`);
                    // Opcional: deletar a sala do Firestore se não houver mais jogadores
                    // deleteRoomConfigFromFirestore(room);
                    // delete roomConfigs[room];
                }
                delete playerDisconnectionTimers[userId]; // Remove o temporizador
            }, 10000); // 10 segundos de espera para reconexão do admin
        }

        // Atualiza a lista de jogadores para todos na sala (seja admin ou não)
        const playersInRoom = Object.values(players)
            .filter((p) => p.room === room)
            .map((p) => ({
                id: p.id,
                nickname: p.nickname,
                userId: p.userId,
                isCreator: p.isCreator,
            }));
        io.to(room).emit("players_update", playersInRoom);
    });
    // --- Fim do tratamento de desconexão ---


    socket.on("rejoin_room", async ({ roomId, nickname, userId }) => {
        try {
            console.log(`[Backend Log - rejoin_room] Tentativa de reingresso: userId=${userId}, roomId=${roomId}, nickname=${nickname}`);

            if (!userId || !roomId || !nickname) {
                console.warn(`[Backend Log - rejoin_room] Dados incompletos. userId: ${userId}, roomId: ${roomId}, nickname: ${nickname}`);
                socket.emit('room_error', { message: 'Dados de reingresso incompletos.' });
                return;
            }

            // Se o jogador reconectar, limpe o temporizador de desconexão.
            if (playerDisconnectionTimers[userId]) {
                clearTimeout(playerDisconnectionTimers[userId]);
                delete playerDisconnectionTimers[userId];
                console.log(`[Socket.io] Admin ${userId} da sala ${roomId} reconectou. Temporizador de desconexão cancelado.`);
            }

            let roomConfig = null;
            let configChanged = false; // Flag para rastrear se a config mudou e precisa ser salva/emitida

            // Tenta carregar do Firestore primeiro, depois da memória
            let configFromFirestore = await getRoomConfigFromFirestore(roomId);
            if (configFromFirestore) {
                roomConfig = { ...configFromFirestore, isSaved: true };
                console.log(`[Backend Log - rejoin_room] Sala ${roomId} encontrada no Firestore. isSaved: true.`);

                // Ensure validationStates is cleared on rejoin for a saved room.
                // This prevents stale validation data if a judge reconnects mid-validation.
                if (validationStates[roomId]) {
                    delete validationStates[roomId];
                }
            } else if (roomConfigs[roomId]) {
                roomConfig = { ...roomConfigs[roomId], isSaved: false };
                console.log(`[Backend Log - rejoin_room] Sala ${roomId} encontrada em memória. isSaved: ${roomConfig.isSaved}.`);
            } else {
                console.log(`[Backend Log - rejoin_room] Reingresso falhou: Sala ${roomId} não encontrada em memória nem no Firestore.`);
                socket.emit('rejoin_room_fail');
                return;
            }

            // --- Lógica para resetar estado de rodada se a sala estiver salva e finalizada ---
            if (roomConfig.isSaved && (roomConfig.roundEnded || roomConfig.roundActive || roomConfig.currentLetter || roomConfig.stopClickedByMe)) {
                console.log(`[Backend Log - rejoin_room] Resetando estado de rodada para sala salva ${roomId}.`);
                roomConfig.roundActive = false;
                roomConfig.roundEnded = false;
                roomConfig.currentLetter = null;
                roomConfig.stopClickedByMe = null;
                configChanged = true; // Marcar que a configuração foi alterada
            }

            roomConfigs[roomId] = roomConfig; // Garante que a config mais recente esteja em memória

            let player = players[userId];
            if (!player) {
                console.log(`[Backend Log - rejoin_room] Jogador ${userId} não encontrado em memória. Recriando.`);
                player = { id: socket.id, nickname, room: roomId, userId, isCreator: false };
                players[userId] = player;
            } else {
                console.log(`[Backend Log - rejoin_room] Jogador ${userId} encontrado em memória. Atualizando socket ID.`);
                player.id = socket.id;
                player.nickname = nickname;
                player.room = roomId;
            }

            // --- Lógica Revisada de Adoção/Reafirmação do Admin ---
            const activePlayersExcludingCurrent = Object.values(players).filter(p => p.room === roomId && p.userId !== userId);
            const originalCreatorStillActive = roomConfig.creatorId && activePlayersExcludingCurrent.some(p => p.userId === roomConfig.creatorId);

            if (roomConfig.creatorId === userId) {
                player.isCreator = true;
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) é o criador registrado para ${roomId}. Status: Admin.`);
            } else if (!roomConfig.creatorId || (!originalCreatorStillActive && activePlayersExcludingCurrent.length === 0)) {
                roomConfig.creatorId = userId;
                player.isCreator = true;
                console.log(`[Backend Log - ADMIN ASSIGN] Sala ${roomId} órfã ou sem criador. ${nickname} (${userId}) é o novo criador.`);
                configChanged = true; // Marcar que a configuração foi alterada
            } else {
                player.isCreator = false;
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) NÃO é o criador de ${roomId}. Criador: ${roomConfig.creatorId}.`);
            }
            // --- Fim da Lógica Revisada de Adoção/Reafirmação do Admin ---

            socket.userId = userId;
            socket.room = roomId;
            socket.join(roomId);

            // Se a configuração foi alterada (reset ou novo admin), salve no Firestore e emita
            if (configChanged) {
                await saveRoomConfigToFirestore(roomId, roomConfig);
            }
            emitRoomConfig(roomId, roomConfig); // Sempre emite a config mais recente

            const playersInRoom = Object.values(players)
                .filter((p) => p.room === roomId)
                .map((p) => ({
                    id: p.id,
                    nickname: p.nickname,
                    userId: p.userId,
                    isCreator: p.isCreator,
                }));

            const currentRoomData = {
                roomId: roomId,
                players: playersInRoom,
                config: {
                    themes: roomConfig.themes || ["País", "Cidade", "Nome", "Marca", "Cor", "Animal"],
                    duration: roomConfig.duration || 60,
                    creatorId: roomConfig.creatorId,
                    currentLetter: roomConfig.currentLetter,
                    roundActive: roomConfig.roundActive,
                    roundEnded: roomConfig.roundEnded,
                    stopClickedByMe: roomConfig.stopClickedByMe,
                    isSaved: roomConfig.isSaved,
                },
                currentLetter: roomConfig.currentLetter,
                roundStarted: roomConfig.roundActive,
                roundEnded: roomConfig.roundEnded,
                stopClickedByMe: roomConfig.stopClickedByMe === userId, // Ajustado para refletir o novo stopClickedByMe
                isSaved: roomConfig.isSaved,
            };

            console.log(`[Backend Log - rejoin_room] Reingresso bem-sucedido para ${nickname} (${userId}) na sala ${roomId}. isCreator: ${player.isCreator}, isSaved: ${roomConfig.isSaved}, roundEnded: ${roomConfig.roundEnded}.`);
            socket.emit('rejoin_room_success', {
                room: currentRoomData,
                player: {
                    userId: player.userId,
                    nickname: player.nickname,
                    isCreator: player.isCreator,
                }
            });

            io.to(roomId).emit("players_update", playersInRoom);
            
        } catch (error) {
            console.error(`[Socket.io] Erro em rejoin_room para userId ${userId}, sala ${roomId}:`, error);
            socket.emit('room_error', { message: 'Erro ao reentrar na sala.' });
        }
    });

    socket.on("join_room", async ({ userId, room, nickname }) => {
        try {
            console.log(`[Backend Log - join_room] Tentativa de entrada: userId=${userId}, roomId=${room}, nickname=${nickname}`);

            if (!userId || !room || !nickname) {
                console.warn(`[Backend Log - join_room] Dados incompletos. userId: ${userId}, room: ${room}, nickname: ${nickname}`);
                socket.emit('room_error', { message: 'Dados de entrada incompletos para a sala.' });
                return;
            }

            socket.join(room);
            socket.userId = userId;
            socket.room = room;

            let roomIsSaved = false;
            let currentRoomConfig = null;
            let configChanged = false; // Flag para rastrear se a config mudou e precisa ser salva/emitida

            // Tenta carregar do Firestore primeiro, depois da memória
            let configFromFirestore = await getRoomConfigFromFirestore(room);
            if (configFromFirestore) {
                currentRoomConfig = { ...configFromFirestore, isSaved: true };
                roomIsSaved = true;
                console.log(`[Backend Log - join_room] Sala ${room} encontrada no Firestore. isSaved: true, creatorId: ${currentRoomConfig.creatorId}.`);
                
                // Clear validation states for joining a saved room.
                if (validationStates[room]) {
                    delete validationStates[room];
                }

            } else if (roomConfigs[room]) {
                currentRoomConfig = { ...roomConfigs[room] };
                roomIsSaved = currentRoomConfig.isSaved || false;
                console.log(`[Backend Log - join_room] Sala ${room} existente em memória. isSaved: ${currentRoomConfig.isSaved}.`);
            } else {
                // Se a sala não existe em memória nem no Firestore, este é o primeiro jogador, ele é o criador.
                currentRoomConfig = {
                    themes: ["País", "Cidade", "Nome", "Marca", "Cor", "Animal"],
                    duration: 60,
                    creatorId: userId, // Define o criador no momento da criação da sala
                    currentLetter: null,
                    roundActive: false,
                    countdownTimerId: null,
                    roundEnded: false,
                    stopClickedByMe: null,
                    isSaved: false,
                };
                console.log(`[Backend Log - join_room] Nova sala ${room} criada em memória. isSaved: false, creatorId: ${userId}.`);
                configChanged = true; // Uma sala nova sempre representa uma "mudança"
            }

            roomConfigs[room] = currentRoomConfig; // Garante que a config mais recente esteja em memória

            let player = players[userId];
            if (!player) {
                console.log(`[Backend Log - join_room] Jogador ${userId} não encontrado em memória. Recriando.`);
                player = { id: socket.id, nickname, room: room, userId, isCreator: false };
                players[userId] = player;
            } else {
                console.log(`[Backend Log - join_room] Jogador ${userId} encontrado em memória. Atualizando socket ID.`);
                player.id = socket.id;
                player.nickname = nickname;
                player.room = room;
            }

            // --- Lógica Revisada de Adoção/Reafirmação do Admin (Idêntica ao rejoin_room) ---
            const activePlayersExcludingCurrent = Object.values(players).filter(p => p.room === room && p.userId !== userId);
            const originalCreatorStillActive = currentRoomConfig.creatorId && activePlayersExcludingCurrent.some(p => p.userId === currentRoomConfig.creatorId);

            if (currentRoomConfig.creatorId === userId) {
                player.isCreator = true;
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) é o criador registrado para ${room}. Status: Admin.`);
            } else if (!currentRoomConfig.creatorId || (!originalCreatorStillActive && activePlayersExcludingCurrent.length === 0)) {
                currentRoomConfig.creatorId = userId;
                player.isCreator = true;
                console.log(`[Backend Log - ADMIN ASSIGN] Sala ${room} órfã ou sem criador. ${nickname} (${userId}) é o novo criador.`);
                configChanged = true; // Marcar que a configuração foi alterada
            } else {
                player.isCreator = false;
                console.log(`[Backend Log - ADMIN ASSIGN] ${nickname} (${userId}) NÃO é o criador de ${room}. Criador: ${currentRoomConfig.creatorId}.`);
            }
            // --- Fim da Lógica Revisada de Adoção/Reafirmação do Admin ---

            // Se a configuração foi alterada (reset ou novo admin), salve no Firestore
            if (configChanged) {
                await saveRoomConfigToFirestore(room, currentRoomConfig);
            }
            // Sempre emite a config mais recente para todos na sala
            emitRoomConfig(room, currentRoomConfig); 

            // Reconstruir a lista de playersInRoom com os status isCreator atualizados
            const playersInRoom = Object.values(players)
                .filter((p) => p.room === room)
                .map((p) => ({
                    id: p.id,
                    nickname: p.nickname,
                    userId: p.userId,
                    isCreator: p.isCreator,
                }));

            io.to(room).emit("players_update", playersInRoom);
            
            const playerData = players[userId];
            const payload = {
                room: room,
                players: playersInRoom,
                isCreator: playerData.isCreator,
                config: sanitizeRoomConfig(currentRoomConfig),
                player: {
                    userId: playerData.userId,
                    nickname: playerData.nickname,
                    isCreator: playerData.isCreator,
                },
                isSaved: roomIsSaved,
            };
            console.log(`[Backend Log - join_room] Conectado à sala ${room}. Jogador ${playerData.nickname} (${playerData.userId}). É criador: ${playerData.isCreator}. Sala salva: ${roomIsSaved}, roundEnded: ${currentRoomConfig.roundEnded}.`);
            socket.emit("room_joined", payload);
        } catch (error) {
            console.error(`[Socket.io] Erro em join_room para userId ${userId}, sala ${room}:`, error);
            socket.emit('room_error', { message: 'Erro ao entrar na sala.' });
        }
    });

    socket.on("save_room", async ({ room, roomName }) => {
        try {
            const userId = socket.userId;
            if (!userId) {
                console.warn(`[Socket.io] save_room: userId é null. Autenticação/conexão de socket inválida.`);
                socket.emit("room_error", { message: "Erro: Usuário não identificado para salvar a sala." });
                return;
            }
            if (!room || !roomConfigs[room]) {
                console.warn(`[Socket.io] save_room: Sala indefinida ou não existe para ${userId}.`);
                socket.emit("room_error", { message: "Erro: Sala não encontrada ou inválida para salvamento." });
                return;
            }
            const config = roomConfigs[room];
            if (config.creatorId === userId) {
                const savedSuccessfully = await saveRoomConfigToFirestore(room, config);
                if (savedSuccessfully) {
                    config.isSaved = true;
                    emitRoomConfig(room, config);
                    socket.emit("room_saved_success", { room, roomName });
                    io.to(room).emit("room_saved_success", { room, roomName }); // Notifica todos na sala
                    console.log(`[Socket.io] Sala ${room} salva manualmente por ${userId}. isSaved: ${config.isSaved}`);
                } else {
                    socket.emit("room_error", { message: "Erro ao salvar a sala." });
                    console.error(`[Socket.io] Falha ao salvar sala ${room} no Firestore.`);
                }
            } else {
                console.warn(`[Socket.io] save_room: ${userId} não é o criador da sala ${room}.`);
                socket.emit("room_error", { message: "Somente o administrador pode salvar a sala." });
            }
        } catch (error) {
            console.error(`[Socket.io] Erro em save_room para sala ${room}:`, error);
            socket.emit("room_error", { message: "Erro interno do servidor ao salvar a sala." });
        }
    });

    socket.on("update_config", async ({ room, duration, themes }) => {
        try {
            const userId = socket.userId;
            if (!userId) {
                console.warn(`[Socket.io] update_config: userId é null. Autenticação/conexão de socket inválida.`);
                socket.emit("room_error", { message: "Erro: Usuário não identificado para atualizar a sala." });
                return;
            }
            if (!room) {
                console.warn(`[Socket.io] update_config: Sala indefinida para ${userId}.`);
                return;
            }
            const config = roomConfigs[room];
            if (config && config.creatorId === userId) {
                const oldThemes = JSON.stringify(config.themes);
                const oldDuration = config.duration;

                if (duration !== undefined) config.duration = duration;
                if (themes !== undefined) config.themes = themes;

                const hasChanged = JSON.stringify(config.themes) !== oldThemes || config.duration !== oldDuration;

                if (config.isSaved && hasChanged) {
                    const savedSuccessfully = await saveRoomConfigToFirestore(room, config);
                    if (savedSuccessfully) {
                        io.to(room).emit("changes_saved_success", { room });
                        console.log(`[Socket.io] Configuração da sala ${room} atualizada e salva automaticamente por ${userId}.`);
                    } else {
                        socket.emit("room_error", { message: "Erro ao salvar alterações automaticamente." });
                        console.error(`[Socket.io] Falha ao auto-salvar configuração da sala ${room}.`);
                    }
                } else if (config.isSaved && !hasChanged) {
                    console.log(`[Socket.io] Configuração da sala ${room} não alterada, sem auto-salvamento.`);
                } else {
                    console.log(`[Socket.io] Configuração da sala ${room} atualizada em memória por ${userId}, mas não salva no Firestore (ainda não foi salva manualmente).`);
                }
                emitRoomConfig(room, config);
            } else {
                console.warn(`[Socket.io] update_config: ${userId} não é o criador ou sala ${room} não encontrada.`);
            }
        } catch (error) {
            console.error(`[Socket.io] Erro em update_config para sala ${room}:`, error);
            socket.emit("room_error", { message: "Erro ao atualizar configuração da sala." });
        }
    });

    socket.on("start_round", async ({ room }) => {
        try {
            const userId = socket.userId;
            if (!userId) {
                console.warn(`[Backend Log - start_round] userId é null. Autenticação/conexão de socket inválida.`);
                socket.emit("room_error", { message: "Erro: Usuário não identificado para iniciar a rodada." });
                return;
            }
            if (!room) {
                console.warn(`[Backend Log - start_round] Sala indefinida para ${userId}.`);
                socket.emit("room_error", { message: "Erro: Sala não especificada." });
                return;
            }
            const config = roomConfigs[room];
            if (!config) {
                console.warn(`[Backend Log - start_round] Configuração da sala ${room} não encontrada.`);
                socket.emit("room_error", { message: "Erro: Sala não encontrada." });
                return;
            }

            console.log(`[Backend Log - start_round] Antes das checagens - Sala ${room} config: roundActive=${config.roundActive}, countdownTimerId=${config.countdownTimerId}`);

            if (config.creatorId !== userId) {
                console.warn(`[Backend Log - start_round] ${userId} não é o criador da sala ${room}.`);
                socket.emit("room_error", { message: "Somente o administrador pode iniciar a rodada." });
                return;
            }

            if (config.roundActive || config.countdownTimerId) {
                console.log(`[Backend Log - start_round] Rodada ou countdown já ativo na sala ${room}. Ignorando start_round.`);
                return;
            }

            // Clear previous round data
            roomsAnswers[room] = [];
            stopCallers[room] = null;
            validationStates[room] = null;
            
            // Clear overall scores for a new game, if that's the intention of "start_round"
            // If "start_round" means "new round in the same game", then don't clear overall scores here.
            // Assuming "start_round" is for a new round in the same game, overall scores should persist.
            // If it's a new game, add a separate "new_game" event to clear roomOverallScores.
            // For now, let's keep roomOverallScores persistent across rounds.

            if (config.roundTimerId) clearTimeout(config.roundTimerId);
            config.roundEnded = false;
            config.stopClickedByMe = null;
            config.currentLetter = null;
            config.roundActive = false;
            config.countdownTimerId = null;

            await saveRoomConfigToFirestore(room, config);
            emitRoomConfig(room, config);

            io.to(room).emit("round_start_countdown", { initialCountdown: 3 });
            console.log(`[Backend Log - start_round] Iniciando contagem regressiva para a rodada na sala ${room}.`);

            config.countdownTimerId = setTimeout(() => {
                config.countdownTimerId = null;
                console.log(`[Backend Log - start_round] Backend: Countdown para sala ${room} finalizado.`);
            }, 3000);
        } catch (error) {
            console.error(`[Socket.io] Erro em start_round para sala ${room}:`, error);
            socket.emit("room_error", { message: "Erro interno ao iniciar a rodada." });
        }
    });

    socket.on("start_game_actual", async ({ room }) => {
        try {
            const config = roomConfigs[room];
            if (!config) {
                console.warn(`[Backend Log - start_game_actual] Configuração da sala ${room} não encontrada.`);
                socket.emit("room_error", { message: "Erro: Sala não encontrada." });
                return;
            }

            console.log(`[Backend Log - start_game_actual] Antes das checagens - Sala ${room} config: roundActive=${config.roundActive}`);

            if (config.roundActive) {
                console.log(`[Backend Log - start_game_actual] Rodada já ativa na sala ${room}. Ignorando start_game_actual.`);
                return;
            }

            const newLetter = getRandomLetter();
            config.currentLetter = newLetter;
            config.roundActive = true;
            config.roundEnded = false;
            config.stopClickedByMe = null;

            await saveRoomConfigToFirestore(room, config);
            emitRoomConfig(room, config);

            io.to(room).emit("round_started", { duration: config.duration, letter: newLetter });
            console.log(`[Backend Log - start_game_actual] Rodada iniciada *de fato* na sala ${room} com a letra ${newLetter}.`);

            config.roundTimerId = setTimeout(async () => {
                try {
                    console.log(`[Backend Log - start_game_actual] ⏱️ Tempo esgotado para a sala ${room}.`);
                    io.to(room).emit("round_ended");
                    if (config.roundTimerId) clearTimeout(config.roundTimerId);
                    config.roundTimerId = null;
                    config.roundActive = false;
                    config.roundEnded = true;
                    config.currentLetter = null;
                    await saveRoomConfigToFirestore(room, config);
                    initiateValidationAfterDelay(room);
                } catch (err) {
                    console.error(`[Socket.io] Erro no timeout final da rodada para sala ${room}:`, err);
                }
            }, config.duration * 1000);
        } catch (error) {
            console.error(`[Socket.io] Erro em start_game_actual para sala ${room}:`, error);
            socket.emit("room_error", { message: "Erro interno ao iniciar o jogo." });
        }
    });

    socket.on("stop_round", async () => {
        try {
            const room = socket.room;
            const userId = socket.userId;
            if (!userId) {
                console.warn(`[Socket.io] stop_round: userId é null. Autenticação/conexão de socket inválida.`);
                socket.emit("room_error", { message: "Erro: Usuário não identificado." });
                return;
            }
            if (!room) {
                console.warn(`[Socket.io] stop_round: Sala indefinida para ${userId}.`);
                socket.emit("room_error", { message: "Erro: Sala não especificada." });
                return;
            }
            const config = roomConfigs[room];

            if (!config || !config.roundActive) {
                console.log(`[Socket.io] 🚫 Tentativa de STOP em rodada inativa na sala ${room}.`);
                return;
            }

            console.log(`[Socket.io] 🛑 Jogador ${userId} clicou STOP na sala ${room}.`);
            stopCallers[room] = userId;
            if (config.roundTimerId) {
                clearTimeout(config.roundTimerId);
                config.roundTimerId = null;
            }
            config.roundActive = false;
            config.roundEnded = true;
            config.stopClickedByMe = userId;
            config.currentLetter = null;
            await saveRoomConfigToFirestore(room, config);
            io.to(room).emit("round_ended");
            initiateValidationAfterDelay(room);
        } catch (error) {
            console.error(`[Socket.io] Erro em stop_round para sala ${socket.room}:`, error);
            socket.emit("room_error", { message: "Erro interno ao parar a rodada." });
        }
    });

    socket.on("validate_answer", ({ valid, room }) => {
    try {
        const userId = socket.userId;
        if (!userId) { socket.emit("room_error", { message: "Erro: Usuário não identificado." }); return; }
        if (!room || !roomConfigs[room]) { socket.emit("room_error", { message: "Erro: Sala não encontrada." }); return; }
        const validationState = validationStates[room];
        if (!validationState) { socket.emit("room_error", { message: "Erro: Estado de validação não encontrado." }); return; }
        if (validationState.validatorId !== userId) { socket.emit("room_error", { message: "Erro: Apenas o juiz pode validar respostas." }); return; }

        const currentPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
        const currentAnswer = currentPlayer.answers[validationState.currentThemeIndex];
        if (!currentAnswer || typeof currentAnswer !== 'object') { socket.emit("room_error", { message: "Erro interno ao validar resposta." }); return; }

        const currentThemeIndex = validationState.currentThemeIndex;
        const normalizedCurrentAnswer = normalizeAnswer(currentAnswer.answer || "");
        const previousPointsForCurrentAnswer = currentAnswer.points || 0;
        currentAnswer.validated = true;

        // 1. Validação padrão
        if (!currentAnswer.answer || currentAnswer.answer.trim() === "") {
            currentAnswer.points = 0;
        } else if (valid) {
            // Temporariamente, considere 100
            currentAnswer.points = 100;
        } else {
            currentAnswer.points = 0;
        }

        // 2. DUPLICIDADE — sempre garanta simetria após validar/anular
        // Só aplica lógica de duplicidade se a resposta foi validada e não está vazia
        if (valid && currentAnswer.points > 0) {
            // Liste todos os outros jogadores já validados, com resposta igual, e pontos > 0
            const duplicates = roomsAnswers[room].filter(player => {
                if (player.id === currentPlayer.id) return false;
                const ans = player.answers[currentThemeIndex];
                return (
                    ans &&
                    ans.validated &&
                    ans.points > 0 &&
                    normalizeAnswer(ans.answer || "") === normalizedCurrentAnswer
                );
            });

            if (duplicates.length > 0) {
                // Se existe pelo menos um duplicado, todos (inclusive o atual) vão para 50
                currentAnswer.points = 50;
                for (const dup of duplicates) {
                    const dupAnswer = dup.answers[currentThemeIndex];
                    if (dupAnswer.points !== 50) {
                        // Ajuste o overall score do duplicado
                        if (!roomOverallScores[room][dup.id]) roomOverallScores[room][dup.id] = 0;
                        roomOverallScores[room][dup.id] = roomOverallScores[room][dup.id] - (dupAnswer.points - 50);
                        dupAnswer.points = 50;
                    }
                }
            }
        } else if (!valid || currentAnswer.points === 0) {
            // Se ANULOU ou zerou, pode ser que algum duplicado tenha virado único (desduplicação)
            if (currentAnswer.answer && currentAnswer.answer.trim() !== "") {
                // Procure todos os outros que eram duplicados desta exata resposta
                const others = roomsAnswers[room].filter(player => player.id !== currentPlayer.id);
                for (const other of others) {
                    const otherAnswer = other.answers[currentThemeIndex];
                    if (
                        otherAnswer &&
                        otherAnswer.validated &&
                        otherAnswer.points === 50 && // Só se era duplicata
                        normalizeAnswer(otherAnswer.answer || "") === normalizedCurrentAnswer
                    ) {
                        // Veja se agora ele ficou único (ninguém mais igual com pontos > 0)
                        const stillDuplicates = roomsAnswers[room].filter(p2 => {
                            if (p2.id === other.id) return false;
                            const ans2 = p2.answers[currentThemeIndex];
                            return (
                                ans2 &&
                                ans2.validated &&
                                ans2.points > 0 &&
                                normalizeAnswer(ans2.answer || "") === normalizeAnswer(otherAnswer.answer || "")
                            );
                        });
                        if (stillDuplicates.length === 0) {
                            // Agora virou resposta única: volta para 100
                            if (!roomOverallScores[room][other.id]) roomOverallScores[room][other.id] = 0;
                            roomOverallScores[room][other.id] = roomOverallScores[room][other.id] - 50 + 100;
                            otherAnswer.points = 100;
                        }
                    }
                }
            }
        }

        // 3. Atualiza pontuação total (overall)
        if (!roomOverallScores[room]) roomOverallScores[room] = {};
        if (!roomOverallScores[room][currentPlayer.id]) roomOverallScores[room][currentPlayer.id] = 0;
        roomOverallScores[room][currentPlayer.id] = roomOverallScores[room][currentPlayer.id] - previousPointsForCurrentAnswer + currentAnswer.points;
        if (roomOverallScores[room][currentPlayer.id] < 0) roomOverallScores[room][currentPlayer.id] = 0;

        // LOG DETALHADO
        console.log(`[VALIDATE] ${currentPlayer.nickname} "${currentAnswer.answer}" | valid: ${valid} | pontos: ${currentAnswer.points}`);
        for (const p of roomsAnswers[room]) {
            const as = p.answers.map(a => `${a.theme}: "${a.answer}" [${a.points}]`).join(" | ");
            console.log(`  - ${p.nickname}: ${as}`);
        }
        console.log("===============================");

        io.to(room).emit("answer_validated", {
            current: {
                playerId: currentPlayer.id,
                playerNickname: currentPlayer.nickname,
                themeIndex: currentThemeIndex,
                theme: currentAnswer.theme,
                answer: currentAnswer.answer,
                points: currentAnswer.points,
                validated: currentAnswer.validated,
                isLastAnswerOfTheme: validationState.currentPlayerIndex === roomsAnswers[room].length - 1,
                isLastAnswerOfGame: validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && currentThemeIndex === roomConfigs[room].themes.length - 1,
            },
        });

        // Avança para próxima validação
        if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && currentThemeIndex === roomConfigs[room].themes.length - 1) {
            const allPlayersRoundScores = roomsAnswers[room].map(player => ({
                userId: player.id,
                nickname: player.nickname,
                roundScore: player.answers.reduce((sum, answer) => sum + (answer.points > 0 ? answer.points : 0), 0),
                overallScore: roomOverallScores[room][player.id] || 0,
            }));
            io.to(room).emit("all_answers_validated", allPlayersRoundScores);
            delete validationStates[room];
        } else if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1) {
            validationState.currentPlayerIndex = 0;
            validationState.currentThemeIndex += 1;
            const nextPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
            const nextAnswer = nextPlayer.answers[validationState.currentThemeIndex];
            io.to(room).emit("start_validation", {
                current: {
                    playerId: nextPlayer.id,
                    playerNickname: nextPlayer.nickname,
                    themeIndex: validationState.currentThemeIndex,
                    theme: nextAnswer.theme,
                    answer: nextAnswer.answer,
                    validated: nextAnswer.validated || false,
                    isLastAnswerOfTheme: false,
                    isLastAnswerOfGame: validationState.currentThemeIndex === roomConfigs[room].themes.length - 1,
                },
                judgeId: socket.id,
            });
        } else {
            validationState.currentPlayerIndex += 1;
            const nextPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
            const nextAnswer = nextPlayer.answers[validationState.currentThemeIndex];
            io.to(room).emit("start_validation", {
                current: {
                    playerId: nextPlayer.id,
                    playerNickname: nextPlayer.nickname,
                    themeIndex: validationState.currentThemeIndex,
                    theme: nextAnswer.theme,
                    answer: nextAnswer.answer,
                    validated: nextAnswer.validated || false,
                    isLastAnswerOfTheme: validationState.currentPlayerIndex === roomsAnswers[room].length - 1,
                    isLastAnswerOfGame: validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && validationState.currentThemeIndex === roomConfigs[room].themes.length - 1,
                },
                judgeId: socket.id,
            });
        }
    } catch (error) {
        socket.emit("room_error", { message: "Erro interno ao validar resposta." });
    }
});

    socket.on("end_game", async () => {
        try {
            const room = socket.room;
            const userId = socket.userId;
            if (!userId) {
                console.warn(`[Socket.io] end_game: userId é null. Autenticação/conexão de socket inválida.`);
                socket.emit("room_error", { message: "Erro: Usuário não identificado." });
                return;
            }
            if (!room) {
                socket.emit("room_error", { message: "Erro: Sala não especificada." });
                return;
            }
            const finalScores = Object.entries(roomOverallScores[room] || {}).map(([pId, total]) => {
                const nickname = players[pId]?.nickname || `Jogador Desconhecido (${pId.substring(0, 4)}...)`;
                return { nickname, total };
            });

            const ranking = finalScores.sort((a, b) => b.total - a.total);
            io.to(room).emit("game_ended", ranking);

            if (roomConfigs[room]) {
                roomConfigs[room].currentLetter = null;
                roomConfigs[room].roundActive = false;
                roomConfigs[room].roundEnded = false;
                roomConfigs[room].stopClickedByMe = null;
                await saveRoomConfigToFirestore(room, roomConfigs[room]);
            }

            // Clear ALL game data including overall scores for a true "end game"
            delete roomsAnswers[room];
            delete stopCallers[room];
            delete validationStates[room];
            delete roomOverallScores[room]; 

            console.log(`[Socket.io] Partida na sala ${room} encerrada. Configurações da sala mantidas, dados de jogo limpos.`);
        } catch (error) {
            console.error(`[Socket.io] Erro em end_game para sala ${socket.room}:`, error);
            socket.emit("room_error", { message: "Erro interno ao encerrar o jogo." });
        }
    });

    socket.on("leave_room", async () => {
        try {
            const userId = socket.userId;
            const room = socket.room;

            if (!userId || !room) {
                console.log(`[Socket.io] leave_room: Socket não identificado (userId: ${userId}, room: ${room}).`);
                socket.emit("room_error", { message: "Erro: Usuário ou sala não identificados." });
                return;
            }

            // Remove o jogador do estado 'players'
            if (players[userId] && players[userId].room === room) {
                delete players[userId];
                socket.leave(room);
                console.log(`[Socket.io] Jogador ${userId} saiu explicitamente da sala ${room}.`);
            } else {
                console.warn(`[Socket.io] Jogador ${userId} tentou sair da sala ${room}, mas não foi encontrado ou não pertence a esta sala.`);
                return; // Impede a continuação se o jogador não foi encontrado/removido
            }

            const playersInRoom = Object.values(players).filter((p) => p.room === room);

            const roomConfig = roomConfigs[room];

            // Se o jogador que saiu era o criador da sala E ainda há jogadores na sala
            if (roomConfig && roomConfig.creatorId === userId && playersInRoom.length > 0) {
                const newCreator = playersInRoom[0]; // Promove o primeiro jogador restante
                roomConfig.creatorId = newCreator.userId;
                players[newCreator.userId].isCreator = true; // Atualiza o status em memória
                await saveRoomConfigToFirestore(room, roomConfig); // Persiste a mudança
                emitRoomConfig(room, roomConfig); // Notifica com a nova config
                console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}) após saída do antigo criador.`);
            } else if (playersInRoom.length === 0) {
                // Se a sala ficou vazia, limpa os dados da sala
                console.log(`[Socket.io] Sala ${room} vazia após saída.`);
                if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
                    clearTimeout(roomConfigs[room].roundTimerId);
                    roomConfigs[room].roundTimerId = null;
                }
                if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
                    clearTimeout(roomConfigs[room].countdownTimerId);
                    roomConfigs[room].countdownTimerId = null;
                }
                // When a room becomes empty, clear all associated game data
                delete roomsAnswers[room];
                delete stopCallers[room];
                delete validationStates[room];
                delete roomOverallScores[room]; // Clear overall scores if room is truly abandoned
                // Opcional: deleteRoomConfigFromFirestore(room);
                // delete roomConfigs[room]; // Keep roomConfig in memory if you want to reuse room ID
            }

            // Always emit players_update, even if the room is empty (will result in empty list)
            io.to(room).emit("players_update", playersInRoom.map(p => ({
                id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.isCreator
            })));

        } catch (error) {
            console.error(`[Socket.io] Erro em leave_room para userId ${socket.userId}, sala ${socket.room}:`, error);
            socket.emit("room_error", { message: "Erro interno ao sair da sala." });
        }
    });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});