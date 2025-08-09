require('dotenv').config();

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
const roomOverallScores = {};

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

    playersInRoom.forEach(p => {
      const playerAnswersIndex = roomsAnswers[room].findIndex(r => r.id === p.userId);
      if (playerAnswersIndex === -1) {
        console.log(`[Socket.io] Jogador ${p.nickname} não submeteu respostas. Preenchendo com vazios para ${totalThemes} temas.`);
        roomsAnswers[room].push({
          id: p.userId,
          nickname: p.nickname,
          answers: currentThemes.map(theme => ({ theme, answer: "", points: null }))
        });
      } else {
        const playerAnswers = roomsAnswers[room][playerAnswersIndex];
        playerAnswers.answers = currentThemes.map(theme => {
          const existingAnswer = playerAnswers.answers.find(a => a.theme === theme);
          return existingAnswer || { theme, answer: "", points: null, validated: false };
        });
      }
    });

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

    const initialValidatorId = stopCallers[room] || roomsAnswers[room][0].id;

    validationStates[room] = {
      currentPlayerIndex: 0,
      currentThemeIndex: 0,
      validatorId: initialValidatorId,
      roundLetter: config.currentLetter,
    };

    const currentPlayer = roomsAnswers[room][validationStates[room].currentPlayerIndex];
    const currentThemeData = currentPlayer.answers[validationStates[room].currentThemeIndex] || { theme: config.themes[validationStates[room].currentThemeIndex], answer: "", points: null };
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
        validated: currentThemeData.validated || false,
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
  socket.userId = generateUserId();
  socket.room = null;
  console.log(`[Socket.io] Nova conexão. Socket ID: ${socket.id}, userId: ${socket.userId}`);

  socket.on("rejoin_room", async ({ roomId, nickname, userId }) => {
    try {
      console.log(`[Backend Log - rejoin_room] Tentativa de reingresso: userId=${userId}, roomId=${roomId}, nickname=${nickname}`);

      if (!userId || !roomId || !nickname) {
        console.warn(`[Backend Log - rejoin_room] Dados incompletos. userId: ${userId}, roomId: ${roomId}, nickname: ${nickname}`);
        socket.emit('room_error', { message: 'Dados de reingresso incompletos.' });
        return;
      }

      let roomConfig = null;
      let isCreator = false;

      // Tentar carregar a configuração da sala do Firestore
      let configFromFirestore = await getRoomConfigFromFirestore(roomId);
      if (configFromFirestore) {
        roomConfig = { ...configFromFirestore, isSaved: true };
        console.log(`[Backend Log - rejoin_room] Sala ${roomId} encontrada no Firestore. isSaved: true.`);
      } else if (roomConfigs[roomId]) {
        roomConfig = { ...roomConfigs[roomId], isSaved: false };
        console.log(`[Backend Log - rejoin_room] Sala ${roomId} encontrada em memória. isSaved: ${roomConfig.isSaved}.`);
      } else {
        console.log(`[Backend Log - rejoin_room] Reingresso falhou: Sala ${roomId} não encontrada em memória nem no Firestore.`);
        socket.emit('rejoin_room_fail');
        return;
      }

      roomConfigs[roomId] = roomConfig;

      // Verificar se o jogador existe no mapa players
      let player = players[userId];
      if (!player) {
        console.log(`[Backend Log - rejoin_room] Jogador ${userId} não encontrado. Criando novo jogador.`);
        player = { id: socket.id, nickname, room: roomId, userId, isCreator: roomConfig.creatorId === userId };
        players[userId] = player;
      } else {
        player.id = socket.id;
        player.nickname = nickname;
        player.room = roomId;
      }

      isCreator = roomConfig.creatorId === userId;
      player.isCreator = isCreator;

      socket.userId = userId;
      socket.room = roomId;
      socket.join(roomId);

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
          currentLetter: roomConfig.currentLetter || null,
          roundActive: roomConfig.roundActive || false,
          roundEnded: roomConfig.roundEnded || false,
          stopClickedByMe: roomConfig.stopClickedByMe || null,
          isSaved: roomConfig.isSaved || false,
        },
        currentLetter: roomConfig.currentLetter,
        roundStarted: roomConfig.roundActive,
        roundEnded: roomConfig.roundEnded || false,
        stopClickedByMe: stopCallers[roomId] === userId,
        isSaved: roomConfig.isSaved || false,
      };

      console.log(`[Backend Log - rejoin_room] Reingresso bem-sucedido para ${nickname} (${userId}) na sala ${roomId}. isCreator: ${isCreator}, isSaved: ${roomConfig.isSaved}`);
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

      let isCreator = false;
      let roomIsSaved = false;
      let currentRoomConfig = null;

      let configFromFirestore = await getRoomConfigFromFirestore(room);
      if (configFromFirestore) {
        currentRoomConfig = { ...configFromFirestore, isSaved: true };
        roomIsSaved = true;
        isCreator = currentRoomConfig.creatorId === userId;
        console.log(`[Backend Log - join_room] Sala ${room} encontrada no Firestore. isSaved: true, creatorId: ${currentRoomConfig.creatorId}.`);
      } else if (roomConfigs[room]) {
        currentRoomConfig = { ...roomConfigs[room] };
        const roomHasCreatorInMemory = Object.values(players).some((p) => p.room === room && p.isCreator);
        if (!roomHasCreatorInMemory && !currentRoomConfig.creatorId) {
          isCreator = true;
          currentRoomConfig.creatorId = userId;
          console.log(`[Backend Log - join_room] Atualizando sala ${room} em memória. Definindo criador: ${userId}.`);
        } else {
          isCreator = currentRoomConfig.creatorId === userId;
        }
        console.log(`[Backend Log - join_room] Sala ${room} existente em memória. isSaved: ${currentRoomConfig.isSaved}.`);
      } else {
        isCreator = true;
        currentRoomConfig = {
          themes: ["País", "Cidade", "Nome", "Marca", "Cor", "Animal"],
          duration: 60,
          creatorId: userId,
          currentLetter: null,
          roundActive: false,
          countdownTimerId: null,
          roundEnded: false,
          stopClickedByMe: null,
          isSaved: false,
        };
        console.log(`[Backend Log - join_room] Nova sala ${room} criada em memória. isSaved: false, creatorId: ${userId}.`);
      }

      roomConfigs[room] = currentRoomConfig;

      const existingPlayer = players[userId];
      if (existingPlayer && existingPlayer.room === room) {
        existingPlayer.id = socket.id;
        existingPlayer.nickname = nickname;
        existingPlayer.isCreator = isCreator;
        console.log(`[Backend Log - join_room] Jogador existente ${nickname} (${userId}) reconectado na sala ${room}.`);
      } else {
        players[userId] = { id: socket.id, nickname, room, isCreator, userId };
        console.log(`[Backend Log - join_room] ${nickname} (${userId}) entrou na sala ${room}. É criador: ${isCreator}`);
      }

      const playersInRoom = Object.values(players)
        .filter((p) => p.room === room)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          userId: p.userId,
          isCreator: p.isCreator,
        }));

      io.to(room).emit("players_update", playersInRoom);
      emitRoomConfig(room, roomConfigs[room]);

      const playerData = players[userId];
      const payload = {
        room: room,
        players: playersInRoom,
        isCreator: playerData.isCreator,
        config: sanitizeRoomConfig(roomConfigs[room]),
        player: {
          userId: playerData.userId,
          nickname: playerData.nickname,
          isCreator: playerData.isCreator,
        },
        isSaved: roomIsSaved,
      };
      console.log(`[Backend Log - join_room] Conectado à sala ${room}. Jogador ${playerData.nickname} (${playerData.userId}). É criador: ${playerData.isCreator}. Sala salva: ${roomIsSaved}.`);
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

      roomsAnswers[room] = [];
      stopCallers[room] = null;
      validationStates[room] = null;
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

  socket.on("reveal_answer", ({ room }) => {
    try {
      const userId = socket.userId;
      if (!userId) {
        console.warn(`[Socket.io] reveal_answer: userId é null. Autenticação/conexão de socket inválida.`);
        socket.emit("room_error", { message: "Erro: Usuário não identificado." });
        return;
      }
      console.log(`[Socket.io] Recebido reveal_answer do juiz. Socket ID: ${socket.id}, Sala: ${room}`);
      if (!room || !roomConfigs[room]) {
        console.warn(`[Socket.io] reveal_answer: Sala ${room} indefinida ou não encontrada.`);
        socket.emit("room_error", { message: "Erro: Sala não encontrada." });
        return;
      }
      const validationState = validationStates[room];
      if (!validationState) {
        console.warn(`[Socket.io] reveal_answer: Estado de validação não encontrado para sala ${room}.`);
        socket.emit("room_error", { message: "Erro: Estado de validação não encontrado." });
        return;
      }
      if (validationState.validatorId !== userId) {
        console.warn(`[Socket.io] reveal_answer: Socket ${socket.id} (userId: ${userId}) não é o juiz atual para sala ${room}.`);
        socket.emit("room_error", { message: "Erro: Apenas o juiz pode revelar respostas." });
        return;
      }
      io.to(room).emit("reveal_answer");
      console.log(`[Socket.io] Evento reveal_answer propagado para todos na sala ${room}.`);
    } catch (error) {
      console.error(`[Socket.io] Erro em reveal_answer para sala ${room}:`, error);
      socket.emit("room_error", { message: "Erro interno ao revelar resposta." });
    }
  });

  socket.on("validate_answer", ({ valid, room }) => {
    try {
      const userId = socket.userId;
      if (!userId) {
        console.warn(`[Socket.io] validate_answer: userId é null. Autenticação/conexão de socket inválida.`);
        socket.emit("room_error", { message: "Erro: Usuário não identificado." });
        return;
      }
      console.log(`[Socket.io] Recebido validate_answer. Socket ID: ${socket.id}, Sala: ${room}, Valid: ${valid}`);
      if (!room || !roomConfigs[room]) {
        console.warn(`[Socket.io] validate_answer: Sala ${room} indefinida ou não encontrada.`);
        socket.emit("room_error", { message: "Erro: Sala não encontrada." });
        return;
      }
      const validationState = validationStates[room];
      if (!validationState) {
        console.warn(`[Socket.io] validate_answer: Estado de validação não encontrado para sala ${room}.`);
        socket.emit("room_error", { message: "Erro: Estado de validação não encontrado." });
        return;
      }
      if (validationState.validatorId !== userId) {
        console.warn(`[Socket.io] validate_answer: Socket ${socket.id} (userId: ${userId}) não é o juiz atual para sala ${room}.`);
        socket.emit("room_error", { message: "Erro: Apenas o juiz pode validar respostas." });
        return;
      }

      const currentPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
      const currentAnswer = currentPlayer.answers[validationState.currentThemeIndex];
      currentAnswer.validated = true;
      currentAnswer.points = valid ? 10 : 0;

      if (!roomOverallScores[room]) roomOverallScores[room] = {};
      if (!roomOverallScores[room][currentPlayer.id]) roomOverallScores[room][currentPlayer.id] = 0;
      roomOverallScores[room][currentPlayer.id] += currentAnswer.points;

      console.log(`[Socket.io] Resposta validada para sala ${room}:`, {
        playerId: currentPlayer.id,
        playerNickname: currentPlayer.nickname,
        themeIndex: validationState.currentThemeIndex,
        theme: currentAnswer.theme,
        answer: currentAnswer.answer,
        points: currentAnswer.points,
        validated: currentAnswer.validated,
      });

      io.to(room).emit("answer_validated", {
        current: {
          playerId: currentPlayer.id,
          playerNickname: currentPlayer.nickname,
          themeIndex: validationState.currentThemeIndex,
          theme: currentAnswer.theme,
          answer: currentAnswer.answer,
          points: currentAnswer.points,
          validated: currentAnswer.validated,
          isLastAnswerOfTheme: validationState.currentPlayerIndex === roomsAnswers[room].length - 1,
          isLastAnswerOfGame: validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && validationState.currentThemeIndex === roomConfigs[room].themes.length - 1,
        },
      });

      if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && validationState.currentThemeIndex === roomConfigs[room].themes.length - 1) {
        console.log(`[Socket.io] Todas as respostas validadas para a sala ${room}`);
        const roundScores = roomsAnswers[room].map(player => ({
          userId: player.id,
          nickname: player.nickname,
          roundScore: player.answers.reduce((sum, answer) => sum + (answer.points || 0), 0),
          overallScore: roomOverallScores[room][player.id] || 0,
        }));
        io.to(room).emit("all_answers_validated", roundScores);
        delete validationStates[room];
      } else if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1) {
        validationState.currentPlayerIndex = 0;
        validationState.currentThemeIndex += 1;
        const nextPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
        const nextAnswer = nextPlayer.answers[validationState.currentThemeIndex];
        console.log(`[Socket.io] Passando para o próximo tema na sala ${room}`);
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
        console.log(`[Socket.io] Passando para a próxima resposta na sala ${room}`);
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
      console.error(`[Socket.io] Erro em validate_answer para sala ${room}:`, error);
      socket.emit("room_error", { message: "Erro interno ao validar resposta." });
    }
  });

  socket.on("submit_answers", (answers) => {
    try {
      const userId = socket.userId;
      const room = socket.room;
      if (!userId) {
        console.warn(`[Socket.io] submit_answers: userId é null. Autenticação/conexão de socket inválida.`);
        socket.emit("room_error", { message: "Erro: Usuário não identificado." });
        return;
      }
      if (!room) {
        console.warn(`[Socket.io] submit_answers: Sala indefinida para ${userId}.`);
        socket.emit("room_error", { message: "Erro: Sala não especificada." });
        return;
      }
      const nickname = players[userId]?.nickname;
      const config = roomConfigs[room];

      if (!config) {
        console.log(`[Socket.io] 🚫 Respostas submetidas: Configuração da sala ${room} não encontrada para ${nickname}.`);
        socket.emit("room_error", { message: "Erro: Sala não encontrada." });
        return;
      }

      if (!roomsAnswers[room]) roomsAnswers[room] = [];

      const idx = roomsAnswers[room].findIndex((p) => p.id === userId);
      if (idx >= 0) {
        roomsAnswers[room][idx].answers = answers;
      } else {
        roomsAnswers[room].push({ id: userId, nickname, answers });
      }
      console.log(`[Socket.io] ✅ Respostas submetidas por ${nickname} na sala ${room}.`);
    } catch (error) {
      console.error(`[Socket.io] Erro em submit_answers para userId ${socket.userId}, sala ${socket.room}:`, error);
      socket.emit("room_error", { message: "Erro interno ao submeter respostas." });
    }
  });

  socket.on("reset_round_data", async () => {
    try {
      const room = socket.room;
      const userId = socket.userId;
      if (!userId) {
        console.warn(`[Socket.io] reset_round_data: userId é null. Autenticação/conexão de socket inválida.`);
        socket.emit("room_error", { message: "Erro: Usuário não identificado." });
        return;
      }
      if (!room) {
        socket.emit("room_error", { message: "Erro: Sala não especificada." });
        return;
      }
      if (roomConfigs[room] && roomConfigs[room].creatorId === userId) {
        roomsAnswers[room] = [];
        stopCallers[room] = null;
        validationStates[room] = null;
        if (roomConfigs[room].roundTimerId) {
          clearTimeout(roomConfigs[room].roundTimerId);
          roomConfigs[room].roundTimerId = null;
        }
        if (roomConfigs[room].countdownTimerId) {
          clearTimeout(roomConfigs[room].countdownTimerId);
          roomConfigs[room].countdownTimerId = null;
        }
        roomConfigs[room].currentLetter = null;
        roomConfigs[room].roundActive = false;
        roomConfigs[room].roundEnded = false;
        roomConfigs[room].stopClickedByMe = null;
        await saveRoomConfigToFirestore(room, roomConfigs[room]);
        io.to(room).emit("room_reset_ack");
        emitRoomConfig(room, roomConfigs[room]);
        console.log(`[Backend Log - reset_round_data] Rodada resetada para sala ${room}. roundActive: ${roomConfigs[room].roundActive}, roundEnded: ${roomConfigs[room].roundEnded}`);
      } else {
        socket.emit("room_error", { message: "Erro: Somente o administrador pode resetar a rodada." });
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em reset_round_data para sala ${socket.room}:`, error);
      socket.emit("room_error", { message: "Erro interno ao resetar a rodada." });
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

      delete roomsAnswers[room];
      delete stopCallers[room];
      delete validationStates[room];
      delete roomOverallScores[room];

      Object.keys(players).forEach(pId => {
        if (players[pId].room === room) {
          delete players[pId];
        }
      });

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

      if (players[userId] && players[userId].room === room) {
        delete players[userId];
        socket.leave(room);
        console.log(`[Socket.io] Jogador ${userId} saiu explicitamente da sala ${room}.`);
      } else {
        console.warn(`[Socket.io] Jogador ${userId} tentou sair da sala ${room}, mas não foi encontrado ou não pertence a esta sala.`);
      }

      const playersInRoom = Object.values(players).filter((p) => p.room === room);
      io.to(room).emit("players_update", playersInRoom);

      if (playersInRoom.length === 0) {
        console.log(`[Socket.io] Sala ${room} vazia após saída.`);
        if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
          clearTimeout(roomConfigs[room].roundTimerId);
          roomConfigs[room].roundTimerId = null;
        }
        if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
          clearTimeout(roomConfigs[room].countdownTimerId);
          roomConfigs[room].countdownTimerId = null;
        }

        delete roomsAnswers[room];
        delete stopCallers[room];
        delete validationStates[room];
        delete roomOverallScores[room];
      } else {
        const currentCreatorId = roomConfigs[room]?.creatorId;
        if (currentCreatorId === userId && playersInRoom.length > 0) {
          const newCreator = playersInRoom[0];
          roomConfigs[room].creatorId = newCreator.userId;
          players[newCreator.userId].isCreator = true;
          await saveRoomConfigToFirestore(room, roomConfigs[room]);
          console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}).`);

          io.to(room).emit("players_update", playersInRoom.map(p => ({
            id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.userId === newCreator.userId
          })));
        }
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em leave_room para userId ${socket.userId}, sala ${socket.room}:`, error);
      socket.emit("room_error", { message: "Erro interno ao sair da sala." });
    }
  });

  socket.on("disconnect", () => {
    try {
      const userId = socket.userId;
      const room = socket.room;

      if (!userId || !room || !players[userId]) {
        console.log(`[Socket.io] Desconexão: Socket não identificado ou já processado.`);
        return;
      }

      const playerDisconnected = players[userId];
      delete players[userId];
      console.log(`[Socket.io] Jogador ${playerDisconnected.nickname} (${userId}) desconectou da sala ${room}.`);

      const playersInRoom = Object.values(players).filter((p) => p.room === room);
      io.to(room).emit("players_update", playersInRoom);

      if (playersInRoom.length === 0) {
        console.log(`[Socket.io] Sala ${room} vazia após desconexão.`);
        if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
          clearTimeout(roomConfigs[room].roundTimerId);
          roomConfigs[room].roundTimerId = null;
        }
        if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
          clearTimeout(roomConfigs[room].countdownTimerId);
          roomConfigs[room].countdownTimerId = null;
        }
        delete roomsAnswers[room];
        delete stopCallers[room];
        delete validationStates[room];
        delete roomOverallScores[room];
      } else {
        if (playerDisconnected.isCreator) {
          const newCreator = playersInRoom[0];
          roomConfigs[room].creatorId = newCreator.userId;
          players[newCreator.userId].isCreator = true;
          saveRoomConfigToFirestore(room, roomConfigs[room]);
          console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}) após desconexão do antigo criador.`);
          io.to(room).emit("players_update", playersInRoom.map(p => ({
            id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.userId === newCreator.userId
          })));
        }
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em disconnect para userId ${socket.userId}, sala ${socket.room}:`, error);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});