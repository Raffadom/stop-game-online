const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// Middleware CORS para Express (útil se você tiver outras rotas HTTP/REST)
app.use(cors());

// --- Rota de Teste para a Raiz (/) ---
// Isso evita o erro 404 Not Found quando o navegador acessa a URL base do seu backend.
app.get('/', (req, res) => {
  res.status(200).send("Stop Game Backend is running and ready for Socket.IO connections!");
});
// ------------------------------------

const server = http.createServer(app);

// --- Configuração do Socket.IO com CORS específico ---
// Substitua "https://SEU_DOMINIO_NETLIFY.netlify.app" pela URL EXATA do seu frontend no Netlify.
// Exemplo: "https://seu-jogo-legal.netlify.app"
const io = new Server(server, {
  cors: {
    origin: "https://SEU_DOMINIO_NETLIFY.netlify.app", // <--- MUITO IMPORTANTE: MUDAR AQUI!
    methods: ["GET", "POST"]
  }
});

// --- Variáveis de Estado do Jogo ---
const players = {}; // userId -> { id: socket.id, nickname, room, isCreator, userId }
const roomsAnswers = {}; // room -> [{ id: userId, nickname, answers: [{ theme, answer, points }] }]
const stopCallers = {}; // room -> userId do jogador que clicou STOP
const validationStates = {}; // room -> { currentPlayerIndex, currentThemeIndex, validatorId, roundLetter }
const roomConfigs = {}; // room -> { themes: [], duration, creatorId, currentLetter, roundTimerId, roundActive, countdownTimerId }
const roomOverallScores = {}; // room -> { userId: totalScoreForGame }

// --- Eventos do Socket.IO ---
io.on("connection", (socket) => {
  socket.userId = null;
  socket.room = null;

  socket.on("join_room", ({ userId, room, nickname }) => {
    if (!userId || !room || !nickname) {
      console.warn(`[Socket.io] join_room: Dados incompletos. userId: ${userId}, room: ${room}, nickname: ${nickname}`);
      socket.emit('room_error', { message: 'Dados de entrada incompletos para a sala.' });
      return;
    }

    socket.join(room);
    socket.userId = userId;
    socket.room = room;

    const existingPlayer = players[userId];

    if (existingPlayer && existingPlayer.room === room) {
      existingPlayer.id = socket.id;
      existingPlayer.nickname = nickname;
    } else {
      const roomHasCreator = Object.values(players).some((p) => p.room === room && p.isCreator);
      const isCreator = !roomHasCreator;

      players[userId] = { id: socket.id, nickname, room, isCreator, userId };

      if (!roomConfigs[room]) {
        roomConfigs[room] = {
          themes: ["País", "Cidade", "Nome", "Marca", "Cor", "Animal"], // Temas padrão
          duration: 60,
          creatorId: userId,
          currentLetter: null,
          roundTimerId: null,
          roundActive: false,
          countdownTimerId: null,
        };
      } else if (isCreator && roomConfigs[room].creatorId === undefined) {
        roomConfigs[room].creatorId = userId;
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
      config: roomConfigs[room]
    });

    console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room}. É criador: ${players[userId].isCreator}`);
  });

  socket.on("update_config", ({ room, duration, themes }) => {
    const userId = socket.userId;
    if (!room) {
        console.warn(`[Socket.io] update_config: Sala indefinida para ${userId}.`);
        return;
    }
    const config = roomConfigs[room];
    if (config && config.creatorId === userId) {
      if (duration !== undefined) config.duration = duration;
      if (themes !== undefined) config.themes = themes;
      io.to(room).emit("room_config", config);
      console.log(`[Socket.io] Configuração da sala ${room} atualizada por ${userId}.`);
    } else {
        console.warn(`[Socket.io] update_config: ${userId} não é o criador ou sala ${room} não encontrada.`);
    }
  });

  socket.on("start_round", ({ room }) => {
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

    // Limpa dados de rodadas anteriores
    roomsAnswers[room] = [];
    stopCallers[room] = null;
    validationStates[room] = null;
    if (config.roundTimerId) clearTimeout(config.roundTimerId);

    io.to(room).emit("round_start_countdown", { initialCountdown: 3 });
    console.log(`[Socket.io] Iniciando contagem regressiva para a rodada na sala ${room}.`);

    config.countdownTimerId = setTimeout(() => {
      config.countdownTimerId = null;
      console.log(`[Socket.io] Backend: Countdown para sala ${room} finalizado.`);
    }, 3000);
  });

  socket.on("start_game_actual", ({ room }) => {
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
    io.to(room).emit("room_config", config);

    io.to(room).emit("round_started", { duration: config.duration, letter: newLetter });
    console.log(`[Socket.io] Rodada iniciada *de fato* na sala ${room} com a letra ${newLetter}.`);

    config.roundTimerId = setTimeout(() => {
      console.log(`[Socket.io] ⏱️ Tempo esgotado para a sala ${room}.`);
      io.to(room).emit("round_ended");
      if (config.roundTimerId) clearTimeout(config.roundTimerId);
      config.roundTimerId = null;
      config.roundActive = false;
      initiateValidationAfterDelay(room);
    }, config.duration * 1000);
  });

  socket.on("stop_round", () => {
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
    if (config.roundTimerId) {
      clearTimeout(config.roundTimerId);
      config.roundTimerId = null;
    }
    config.roundActive = false;
    stopCallers[room] = socket.userId;
    io.to(room).emit("round_ended");
    initiateValidationAfterDelay(room);
  });

  socket.on("submit_answers", (answers) => {
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
  });

  socket.on("reveal_answer", () => {
    const room = socket.room;
    if (!room) return;
    const state = validationStates[room];
    if (!state || socket.userId !== state.validatorId) return;
    io.to(room).emit("reveal_answer");
  });

  socket.on("validate_answer", ({ valid }) => {
    const room = socket.room;
    if (!room) return;
    const state = validationStates[room];
    if (!state || socket.userId !== state.validatorId) return;

    const player = roomsAnswers[room][state.currentPlayerIndex];
    const themeIndex = state.currentThemeIndex;
    const answerObj = player.answers[themeIndex];

    const allAnswersForThisTheme = roomsAnswers[room].map(p => p.answers[themeIndex]?.answer?.toLowerCase().trim()).filter(Boolean);
    const currentAnswer = answerObj.answer?.toLowerCase().trim();

    if (!currentAnswer) {
      answerObj.points = 0;
    } else {
      const count = allAnswersForThisTheme.filter(a => a === currentAnswer).length;
      const points = valid ? (count === 1 ? 100 : 50) : 0;
      answerObj.points = points;
    }

    answerObj.validated = true;

    io.to(room).emit("answer_validated", {
      current: {
        playerId: player.id,
        playerNickname: player.nickname,
        themeIndex,
        theme: answerObj.theme,
        answer: answerObj.answer,
        validated: true,
        points: answerObj.points,
      },
      valid,
    });
  });

  socket.on("next_validation", () => {
    const room = socket.room;
    if (!room) return;
    const state = validationStates[room];
    if (!state || socket.userId !== state.validatorId) return;

    const totalPlayers = roomsAnswers[room].length;
    const config = roomConfigs[room];
    const totalThemes = config?.themes?.length || 0;

    let nextPlayerIndex = state.currentPlayerIndex + 1;
    let nextThemeIndex = state.currentThemeIndex;

    if (nextPlayerIndex >= totalPlayers) {
      nextPlayerIndex = 0;
      nextThemeIndex++;
    }

    if (nextThemeIndex >= totalThemes) {
      if (!roomOverallScores[room]) roomOverallScores[room] = {};

      roomsAnswers[room].forEach(p => {
        const roundTotal = p.answers.reduce((acc, a) => acc + (a.points || 0), 0);
        roomOverallScores[room][p.id] = (roomOverallScores[room][p.id] || 0) + roundTotal;
      });

      const currentRoundScores = roomsAnswers[room].map(p => ({
        userId: p.id,
        nickname: p.nickname,
        roundScore: p.answers.reduce((acc, a) => acc + (a.points || 0), 0),
        overallScore: roomOverallScores[room][p.id],
      }));

      io.to(room).emit("all_answers_validated", currentRoundScores);
      validationStates[room] = null;
      return;
    }

    state.currentPlayerIndex = nextPlayerIndex;
    state.currentThemeIndex = nextThemeIndex;

    const currentPlayer = roomsAnswers[room][state.currentPlayerIndex];
    const currentThemeData = currentPlayer.answers[state.currentThemeIndex] || { theme: config.themes[state.currentThemeIndex], answer: "", points: null };
    const validatorSocketId = players[state.validatorId]?.id;

    const isLastPlayerOfTheme = state.currentPlayerIndex === totalPlayers - 1;
    const isLastThemeOfGame = state.currentThemeIndex === totalThemes - 1;

    io.to(room).emit("start_validation", {
      current: {
        playerId: currentPlayer.id,
        playerNickname: currentPlayer.nickname,
        themeIndex: state.currentThemeIndex,
        theme: currentThemeData.theme,
        answer: currentThemeData.answer,
        validated: currentThemeData.validated || false,
        isLastAnswerOfTheme: isLastPlayerOfTheme,
        isLastAnswerOfGame: isLastPlayerOfTheme && isLastThemeOfGame,
      },
      judgeId: validatorSocketId,
    });
  });

  socket.on("reset_round_data", () => {
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
      io.to(room).emit("room_reset_ack");
      io.to(room).emit("room_config", roomConfigs[room]);
    }
  });

  socket.on("end_game", () => {
    const room = socket.room;
    if (!room) return;
    const finalScores = Object.entries(roomOverallScores[room] || {}).map(([userId, total]) => {
      const nickname = players[userId]?.nickname || `Jogador Desconhecido (${userId.substring(0, 4)}...)`;
      return { nickname, total };
    });

    const ranking = finalScores.sort((a, b) => b.total - a.total);
    io.to(room).emit("game_ended", ranking);

    delete roomsAnswers[room];
    delete stopCallers[room];
    delete validationStates[room];
    if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
      clearTimeout(roomConfigs[room].roundTimerId);
    }
    if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
      clearTimeout(roomConfigs[room].countdownTimerId);
    }
    delete roomConfigs[room];
    delete roomOverallScores[room];
  });

  socket.on("disconnect", () => {
    const userId = socket.userId;
    const room = socket.room;

    if (!userId || !room) {
        console.log(`[Socket.io] Desconexão de socket não identificado (userId: ${userId}, room: ${room}).`);
        return;
    }

    if (players[userId]) {
        delete players[userId];
    } else {
        console.warn(`[Socket.io] Jogador ${userId} desconectado da sala ${room}, mas não encontrado no registro global de players.`);
    }

    const playersInRoom = Object.values(players).filter((p) => p.room === room);
    io.to(room).emit("players_update", playersInRoom);
    console.log(`[Socket.io] Jogador ${userId} desconectado da sala ${room}. Restam ${playersInRoom.length} jogadores.`);

    if (playersInRoom.length === 0) {
      console.log(`[Socket.io] Sala ${room} vazia. Limpando dados da sala.`);
      delete roomsAnswers[room];
      delete stopCallers[room];
      delete validationStates[room];
      if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
        clearTimeout(roomConfigs[room].roundTimerId);
      }
      if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
        clearTimeout(roomConfigs[room].countdownTimerId);
      }
      delete roomConfigs[room];
      delete roomOverallScores[room];
    } else {
        const currentCreatorId = roomConfigs[room]?.creatorId;
        if (currentCreatorId === userId && playersInRoom.length > 0) {
            const newCreator = playersInRoom[0];
            roomConfigs[room].creatorId = newCreator.userId;
            players[newCreator.userId].isCreator = true;
            console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}).`);
            
            io.to(room).emit("players_update", playersInRoom.map(p => ({
                id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.userId === newCreator.userId
            })));
            io.to(room).emit("room_config", roomConfigs[room]);
        }
    }
  });
});

// --- Funções Auxiliares ---
function getRandomLetter() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function initiateValidationProcess(room) {
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

  console.log(`[Socket.io] 🚀 Iniciando validação para sala ${room}. Juiz: ${players[validationStates[room].validatorId]?.nickname}.`);
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

// --- Inicia o Servidor ---
// Usa a porta fornecida pelo ambiente (Render) ou 3001 para desenvolvimento local.
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
