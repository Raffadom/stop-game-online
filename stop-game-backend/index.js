require('dotenv').config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const admin = require('firebase-admin');

// Inicialização do Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log("🔥 Firebase Admin SDK inicializado com sucesso!");
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
const roomsCollectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('rooms');

// Funções Auxiliares do Firestore
async function saveRoomConfigToFirestore(roomId, config) {
  try {
    const docRef = roomsCollectionRef.doc(roomId);
    await docRef.set(config, { merge: true });
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

// Variáveis de Estado do Jogo
const players = {};
const roomsAnswers = {};
const stopCallers = {};
const validationStates = {};
const roomConfigs = {};
const roomOverallScores = {};

// Funções Auxiliares
function getRandomLetter() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[Math.floor(Math.random() * alphabet.length)];
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

// Eventos do Socket.IO
io.on("connection", (socket) => {
  socket.userId = null;
  socket.room = null;

  socket.on("rejoin_room", async ({ roomId, nickname, userId }) => {
    try {
      console.log(`[Socket.io] Tentativa de reingresso: Sala ${roomId}, Nickname ${nickname}, UserId ${userId}`);

      let configFromFirestore = await getRoomConfigFromFirestore(roomId);
      if (configFromFirestore) {
        roomConfigs[roomId] = { ...configFromFirestore, isSaved: true };
      } else {
        if (!roomConfigs[roomId]) {
          console.log(`[Socket.io] Reingresso falhou: Sala ${roomId} não encontrada em memória nem no Firestore.`);
          socket.emit('rejoin_room_fail');
          return;
        }
        roomConfigs[roomId].isSaved = false;
      }

      const roomConfig = roomConfigs[roomId];
      const player = players[userId];
      if (!player || player.room !== roomId) {
        console.log(`[Socket.io] Reingresso falhou: Jogador ${nickname} (ID: ${userId}) não encontrado ou não pertence à sala ${roomId}.`);
        socket.emit('rejoin_room_fail');
        return;
      }

      player.id = socket.id;
      player.nickname = nickname;
      socket.userId = userId;
      socket.room = roomId;

      socket.join(roomId);

      const playersInRoom = Object.entries(players)
        .filter(([, p]) => p.room === roomId)
        .map(([uid, p]) => ({
          id: p.id,
          nickname: p.nickname,
          userId: uid,
          isCreator: p.isCreator,
        }));

      socket.emit('rejoin_room_success', {
        room: {
          roomId: roomId,
          players: playersInRoom,
          config: roomConfig,
          currentLetter: roomConfig.currentLetter,
          roundStarted: roomConfig.roundActive,
          roundEnded: roomConfig.roundEnded || false,
          stopClickedByMe: stopCallers[roomId] === userId,
          isSaved: roomConfig.isSaved || false,
        },
        player: {
          userId: player.userId,
          nickname: player.nickname,
          isCreator: player.isCreator,
        }
      });

      io.to(roomId).emit("players_update", playersInRoom);
      console.log(`[Socket.io] Usuário ${nickname} (${userId}) reingresou com sucesso na sala ${roomId}.`);
    } catch (error) {
      console.error(`[Socket.io] Erro em rejoin_room para userId ${userId}, sala ${roomId}:`, error);
    }
  });

  socket.on("join_room", async ({ userId, room, nickname }) => {
    try {
      if (!userId || !room || !nickname) {
        console.warn(`[Socket.io] join_room: Dados incompletos. userId: ${userId}, room: ${room}, nickname: ${nickname}`);
        socket.emit('room_error', { message: 'Dados de entrada incompletos para a sala.' });
        return;
      }

      socket.join(room);
      socket.userId = userId;
      socket.room = room;

      const existingPlayer = players[userId];
      let isCreator = false;
      let roomIsSaved = false;

      let configFromFirestore = await getRoomConfigFromFirestore(room);
      if (configFromFirestore) {
        roomConfigs[room] = { ...configFromFirestore, isSaved: true };
        roomIsSaved = true;
        isCreator = (roomConfigs[room].creatorId === userId);
        if (existingPlayer && existingPlayer.room === room) {
          existingPlayer.id = socket.id;
          existingPlayer.nickname = nickname;
          console.log(`[Socket.io] Jogador existente ${nickname} (${userId}) reconectado na sala ${room} (via Firestore).`);
        } else {
          players[userId] = { id: socket.id, nickname, room, isCreator: isCreator, userId };
          console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room} (via Firestore). É criador: ${isCreator}`);
        }
      } else {
        const roomHasCreator = Object.values(players).some((p) => p.room === room && p.isCreator);
        isCreator = !roomHasCreator;
        if (existingPlayer && existingPlayer.room === room) {
          existingPlayer.id = socket.id;
          existingPlayer.nickname = nickname;
          console.log(`[Socket.io] Jogador existente ${nickname} (${userId}) reconectado na sala ${room} (em memória).`);
        } else {
          players[userId] = { id: socket.id, nickname, room, isCreator, userId };
          console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room} (nova/em memória). É criador: ${isCreator}`);
        }

        if (!roomConfigs[room]) {
          roomConfigs[room] = {
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
          await saveRoomConfigToFirestore(room, roomConfigs[room]);
          roomConfigs[room].isSaved = true;
          roomIsSaved = true;
        } else if (isCreator && roomConfigs[room].creatorId === undefined) {
          roomConfigs[room].creatorId = userId;
          await saveRoomConfigToFirestore(room, roomConfigs[room]);
          roomConfigs[room].isSaved = true;
          roomIsSaved = true;
        }
      }

      const playersInRoom = Object.entries(players)
        .filter(([, p]) => p.room === room)
        .map(([uid, p]) => ({
          id: p.id,
          nickname: p.nickname,
          userId: uid,
          isCreator: p.isCreator,
        }));

      io.to(room).emit("players_update", playersInRoom);
      io.to(room).emit("room_config", roomConfigs[room]);

      socket.emit("room_joined", {
        room: room,
        players: playersInRoom,
        isCreator: players[userId].isCreator,
        config: roomConfigs[room],
        player: {
          userId: userId,
          nickname: nickname,
          isCreator: players[userId].isCreator,
        },
        isSaved: roomIsSaved,
      });
    } catch (error) {
      console.error(`[Socket.io] Erro em join_room para userId ${userId}, sala ${room}:`, error);
    }
  });

  socket.on("save_room", async ({ room }) => {
    try {
      const userId = socket.userId;
      if (!room || !roomConfigs[room]) {
        console.warn(`[Socket.io] save_room: Sala indefinida ou não existe para ${userId}.`);
        return;
      }
      const config = roomConfigs[room];
      if (config.creatorId === userId) {
        await saveRoomConfigToFirestore(room, config);
        config.isSaved = true;
        io.to(room).emit("room_config", config);
        console.log(`[Socket.io] Sala ${room} salva manualmente por ${userId}.`);
      } else {
        console.warn(`[Socket.io] save_room: ${userId} não é o criador da sala ${room}.`);
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em save_room para sala ${room}:`, error);
    }
  });

  socket.on("update_config", async ({ room, duration, themes }) => {
    try {
      const userId = socket.userId;
      if (!room) {
        console.warn(`[Socket.io] update_config: Sala indefinida para ${userId}.`);
        return;
      }
      const config = roomConfigs[room];
      if (config && config.creatorId === userId) {
        if (duration !== undefined) config.duration = duration;
        if (themes !== undefined) config.themes = themes;
        await saveRoomConfigToFirestore(room, config);
        io.to(room).emit("room_config", config);
        console.log(`[Socket.io] Configuração da sala ${room} atualizada por ${userId} e salva no Firestore.`);
      } else {
        console.warn(`[Socket.io] update_config: ${userId} não é o criador ou sala ${room} não encontrada.`);
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em update_config para sala ${room}:`, error);
    }
  });

  socket.on("start_round", async ({ room }) => {
    try {
      if (!room) {
        console.warn(`[Socket.io] start_round: Sala indefinida para ${socket.userId}.`);
        return;
      }
      const config = roomConfigs[room];
      if (!config) {
        console.warn(`[Socket.io] start_round: Configuração da sala ${room} não encontrada.`);
        return;
      }

      if (config.roundActive || config.countdownTimerId) {
        console.log(`[Socket.io] Rodada ou countdown já ativo na sala ${room}. Ignorando start_round.`);
        return;
      }

      roomsAnswers[room] = [];
      stopCallers[room] = null;
      validationStates[room] = null;
      if (config.roundTimerId) clearTimeout(config.roundTimerId);
      config.roundEnded = false;
      config.stopClickedByMe = null;
      config.currentLetter = null;

      await saveRoomConfigToFirestore(room, config);
      io.to(room).emit("room_config", config);

      io.to(room).emit("round_start_countdown", { initialCountdown: 3 });
      console.log(`[Socket.io] Iniciando contagem regressiva para a rodada na sala ${room}.`);

      config.countdownTimerId = setTimeout(() => {
        config.countdownTimerId = null;
        console.log(`[Socket.io] Backend: Countdown para sala ${room} finalizado.`);
      }, 3000);
    } catch (error) {
      console.error(`[Socket.io] Erro em start_round para sala ${room}:`, error);
    }
  });

  socket.on("start_game_actual", async ({ room }) => {
    try {
      const config = roomConfigs[room];
      if (!config) {
        console.warn(`[Socket.io] start_game_actual: Configuração da sala ${room} não encontrada.`);
        return;
      }

      if (config.roundActive) {
        console.log(`[Socket.io] Rodada já ativa na sala ${room}. Ignorando start_game_actual.`);
        return;
      }

      const newLetter = getRandomLetter();
      config.currentLetter = newLetter;
      config.roundActive = true;
      config.roundEnded = false;
      config.stopClickedByMe = null;
      await saveRoomConfigToFirestore(room, config);
      io.to(room).emit("room_config", config);

      io.to(room).emit("round_started", { duration: config.duration, letter: newLetter });
      console.log(`[Socket.io] Rodada iniciada *de fato* na sala ${room} com a letra ${newLetter}.`);

      config.roundTimerId = setTimeout(async () => {
        console.log(`[Socket.io] ⏱️ Tempo esgotado para a sala ${room}.`);
        io.to(room).emit("round_ended");
        if (config.roundTimerId) clearTimeout(config.roundTimerId);
        config.roundTimerId = null;
        config.roundActive = false;
        config.roundEnded = true;
        config.currentLetter = null;
        await saveRoomConfigToFirestore(room, config);
        initiateValidationAfterDelay(room);
      }, config.duration * 1000);
    } catch (error) {
      console.error(`[Socket.io] Erro em start_game_actual para sala ${room}:`, error);
    }
  });

  socket.on("stop_round", async () => {
    try {
      const room = socket.room;
      if (!room) {
        console.warn(`[Socket.io] stop_round: Sala indefinida para ${socket.userId}.`);
        return;
      }
      const config = roomConfigs[room];

      if (!config || !config.roundActive) {
        console.log(`[Socket.io] 🚫 Tentativa de STOP em rodada inativa na sala ${room}.`);
        return;
      }

      console.log(`[Socket.io] 🛑 Jogador ${socket.userId} clicou STOP na sala ${room}.`);
      stopCallers[room] = socket.userId;
      if (config.roundTimerId) {
        clearTimeout(config.roundTimerId);
        config.roundTimerId = null;
      }
      config.roundActive = false;
      config.roundEnded = true;
      config.stopClickedByMe = socket.userId;
      config.currentLetter = null;
      await saveRoomConfigToFirestore(room, config);
      io.to(room).emit("round_ended");
      initiateValidationAfterDelay(room);
    } catch (error) {
      console.error(`[Socket.io] Erro em stop_round para sala ${socket.room}:`, error);
    }
  });

  socket.on("reveal_answer", ({ room }) => {
    try {
      console.log(`[Socket.io] Recebido reveal_answer do juiz. Socket ID: ${socket.id}, Sala: ${room}`);
      if (!room || !roomConfigs[room]) {
        console.warn(`[Socket.io] reveal_answer: Sala ${room} indefinida ou não encontrada.`);
        return;
      }
      const validationState = validationStates[room];
      if (!validationState) {
        console.warn(`[Socket.io] reveal_answer: Estado de validação não encontrado para sala ${room}.`);
        return;
      }
      if (validationState.validatorId !== socket.userId) {
        console.warn(`[Socket.io] reveal_answer: Socket ${socket.id} (userId: ${socket.userId}) não é o juiz atual para sala ${room}.`);
        return;
      }
      io.to(room).emit("reveal_answer");
      console.log(`[Socket.io] Evento reveal_answer propagado para todos na sala ${room}.`);
    } catch (error) {
      console.error(`[Socket.io] Erro em reveal_answer para sala ${room}:`, error);
    }
  });

  socket.on("validate_answer", ({ valid, room }) => {
    try {
      console.log(`[Socket.io] Recebido validate_answer. Socket ID: ${socket.id}, Sala: ${room}, Valid: ${valid}`);
      if (!room || !roomConfigs[room]) {
        console.warn(`[Socket.io] validate_answer: Sala ${room} indefinida ou não encontrada.`);
        return;
      }
      const validationState = validationStates[room];
      if (!validationState) {
        console.warn(`[Socket.io] validate_answer: Estado de validação não encontrado para sala ${room}.`);
        return;
      }
      if (validationState.validatorId !== socket.userId) {
        console.warn(`[Socket.io] validate_answer: Socket ${socket.id} (userId: ${socket.userId}) não é o juiz atual para sala ${room}.`);
        return;
      }

      const currentPlayer = roomsAnswers[room][validationState.currentPlayerIndex];
      const currentAnswer = currentPlayer.answers[validationState.currentThemeIndex];
      currentAnswer.validated = true;
      currentAnswer.points = valid ? 10 : 0; // Exemplo: 10 pontos para válida, 0 para inválida

      // Atualizar pontuação geral do jogador
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

      // Emitir answer_validated para todos na sala
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

      // Avançar para a próxima validação
      if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1 && validationState.currentThemeIndex === roomConfigs[room].themes.length - 1) {
        // Todas as respostas validadas
        console.log(`[Socket.io] Todas as respostas validadas para a sala ${room}`);
        const roundScores = roomsAnswers[room].map(player => ({
          userId: player.id,
          nickname: player.nickname,
          roundScore: player.answers.reduce((sum, answer) => sum + (answer.points || 0), 0),
          overallScore: roomOverallScores[room][player.id] || 0,
        }));
        io.to(room).emit("all_answers_validated", roundScores);
        delete validationStates[room]; // Limpar estado de validação
      } else if (validationState.currentPlayerIndex === roomsAnswers[room].length - 1) {
        // Fim do tema, passar para o próximo tema
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
        // Próxima resposta do mesmo tema
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
    }
  });

  socket.on("submit_answers", (answers) => {
    try {
      const userId = socket.userId;
      const room = socket.room;
      if (!room) {
        console.warn(`[Socket.io] submit_answers: Sala indefinida para ${userId}.`);
        return;
      }
      const nickname = players[userId]?.nickname;
      const config = roomConfigs[room];

      if (!config) {
        console.log(`[Socket.io] 🚫 Respostas submetidas: Configuração da sala ${room} não encontrada para ${nickname}.`);
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
    }
  });

  socket.on("reset_round_data", async () => {
    try {
      const room = socket.room;
      if (!room) return;
      if (roomConfigs[room] && roomConfigs[room].creatorId === socket.userId) {
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
        io.to(room).emit("room_config", roomConfigs[room]);
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em reset_round_data para sala ${socket.room}:`, error);
    }
  });

  socket.on("end_game", async () => {
    try {
      const room = socket.room;
      if (!room) return;
      const finalScores = Object.entries(roomOverallScores[room] || {}).map(([userId, total]) => {
        const nickname = players[userId]?.nickname || `Jogador Desconhecido (${userId.substring(0, 4)}...)`;
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

      Object.keys(players).forEach(userId => {
        if (players[userId].room === room) {
          delete players[userId];
        }
      });

      console.log(`[Socket.io] Partida na sala ${room} encerrada. Configurações da sala mantidas, dados de jogo limpos.`);
    } catch (error) {
      console.error(`[Socket.io] Erro em end_game para sala ${socket.room}:`, error);
    }
  });

  socket.on("leave_room", async () => {
    try {
      const userId = socket.userId;
      const room = socket.room;

      if (!userId || !room) {
        console.log(`[Socket.io] leave_room: Socket não identificado (userId: ${userId}, room: ${room}).`);
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
          io.to(room).emit("room_config", roomConfigs[room]);
        }
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em leave_room para userId ${socket.userId}, sala ${socket.room}:`, error);
    }
  });

  socket.on("disconnect", () => {
    try {
      const userId = socket.userId;
      const room = socket.room;

      if (!userId || !room) {
        console.log(`[Socket.io] Desconexão de socket não identificado (userId: ${userId}, room: ${room}).`);
        return;
      }

      console.log(`[Socket.io] Socket ${socket.id} (usuário ${userId}) desconectado da sala ${room}.`);

      const playersInRoom = Object.values(players).filter((p) => p.room === room);
      io.to(room).emit("players_update", playersInRoom);

      if (playersInRoom.length === 0) {
        console.log(`[Socket.io] Sala ${room} vazia após desconexão. Limpando dados de jogo efêmeros.`);
        delete roomsAnswers[room];
        delete stopCallers[room];
        delete validationStates[room];
        delete roomOverallScores[room];
        if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
          clearTimeout(roomConfigs[room].roundTimerId);
          roomConfigs[room].roundTimerId = null;
        }
        if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
          clearTimeout(roomConfigs[room].countdownTimerId);
          roomConfigs[room].countdownTimerId = null;
        }
      } else {
        const currentCreatorId = roomConfigs[room]?.creatorId;
        if (currentCreatorId === userId && playersInRoom.length > 0) {
          const newCreator = playersInRoom[0];
          roomConfigs[room].creatorId = newCreator.userId;
          players[newCreator.userId].isCreator = true;
          if (roomConfigs[room].isSaved) {
            saveRoomConfigToFirestore(room, roomConfigs[room]);
          }
          console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}).`);

          io.to(room).emit("players_update", playersInRoom.map(p => ({
            id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.userId === newCreator.userId
          })));
          io.to(room).emit("room_config", roomConfigs[room]);
        }
      }
    } catch (error) {
      console.error(`[Socket.io] Erro em disconnect para userId ${socket.userId}, sala ${socket.room}:`, error);
    }
  });
});

// Inicia o Servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});