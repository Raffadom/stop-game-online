const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// --- Configuração das origens permitidas (CORS) ---
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

// --- Variáveis de Estado do Jogo ---
const players = {}; // userId -> { id: socket.id, nickname, room, isCreator, userId }
const roomsAnswers = {}; // room -> [{ id: userId, nickname, answers: [{ theme, answer, points }] }]
const stopCallers = {}; // room -> userId do jogador que clicou STOP
const validationStates = {}; // room -> { currentPlayerIndex, currentThemeIndex, validatorId, roundLetter }
const roomConfigs = {}; // room -> { themes: [], duration, creatorId, currentLetter, roundTimerId, roundActive, countdownTimerId, roundEnded, stopClickedByMe }
const roomOverallScores = {}; // room -> { userId: totalScoreForGame }

// --- Eventos do Socket.IO ---
io.on("connection", (socket) => {
  socket.userId = null;
  socket.room = null;

  // NOVO: Evento para reingresso de usuários após recarga
  socket.on("rejoin_room", ({ roomId, nickname, userId }) => {
    console.log(`[Socket.io] Tentativa de reingresso: Sala ${roomId}, Nickname ${nickname}, UserId ${userId}`);

    // 1. Verificar se a sala existe
    const roomConfig = roomConfigs[roomId];
    if (!roomConfig) {
      console.log(`[Socket.io] Reingresso falhou: Sala ${roomId} não encontrada.`);
      socket.emit('rejoin_room_fail');
      return;
    }

    // 2. Verificar se o jogador existe no registro global de players
    const player = players[userId];
    if (!player || player.room !== roomId) {
      console.log(`[Socket.io] Reingresso falhou: Jogador ${nickname} (ID: ${userId}) não encontrado ou não pertence à sala ${roomId}.`);
      socket.emit('rejoin_room_fail');
      return;
    }

    // 3. Atualizar o socket ID do jogador para o novo socket conectado
    player.id = socket.id; // Atualiza o socket.id do jogador para o novo socket
    player.nickname = nickname; // Garante que o nickname esteja atualizado
    socket.userId = userId; // Associa o userId ao novo socket
    socket.room = roomId; // Associa a sala ao novo socket

    // 4. Fazer o novo socket entrar na sala
    socket.join(roomId);

    // 5. Obter a lista atualizada de jogadores na sala
    const playersInRoom = Object.entries(players)
      .filter(([, p]) => p.room === roomId)
      .map(([uid, p]) => ({
        id: p.id,
        nickname: p.nickname,
        userId: uid,
        isCreator: p.isCreator,
      }));

    // 6. Enviar os dados da sala e do jogador de volta para o cliente que reingressou
    socket.emit('rejoin_room_success', {
      room: {
        roomId: roomId,
        players: playersInRoom, // Envia a lista de jogadores atualizada
        config: roomConfig, // Inclui a configuração da sala (temas, duração, criador)
        currentLetter: roomConfig.currentLetter, // Inclui a letra atual da rodada
        roundStarted: roomConfig.roundActive, // Usa roundActive para indicar se a rodada está ativa
        roundEnded: roomConfig.roundEnded || false, // Adiciona o estado roundEnded
        stopClickedByMe: stopCallers[roomId] === userId, // Verifica se foi ele quem clicou STOP
      },
      player: {
        userId: player.userId,
        nickname: player.nickname,
        isCreator: player.isCreator,
      }
    });

    // 7. Notificar os outros jogadores na sala sobre a atualização da lista de jogadores
    io.to(roomId).emit("players_update", playersInRoom);
    console.log(`[Socket.io] Usuário ${nickname} (${userId}) reingresou com sucesso na sala ${roomId}.`);
  });

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
      // Se o jogador já existe e está na mesma sala, apenas atualiza o socket.id
      existingPlayer.id = socket.id;
      existingPlayer.nickname = nickname; // Atualiza o nickname caso tenha mudado
      console.log(`[Socket.io] Jogador existente ${nickname} (${userId}) reconectado na sala ${room}.`);
    } else {
      // Novo jogador ou jogador em outra sala, cria um novo registro
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
          roundEnded: false, // Adicionado para persistência de estado da rodada
          stopClickedByMe: null, // Adicionado para persistência de quem clicou STOP
        };
      } else if (isCreator && roomConfigs[room].creatorId === undefined) {
        roomConfigs[room].creatorId = userId;
      }
      console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room}. É criador: ${isCreator}`);
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
      player: { // Incluindo os dados do jogador que acabou de entrar
        userId: userId,
        nickname: nickname,
        isCreator: players[userId].isCreator,
      }
    });
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
    config.roundEnded = false; // Garante que o estado da rodada esteja correto
    config.stopClickedByMe = null; // Garante que o estado do STOP esteja correto

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
    config.roundEnded = false; // Garante que o estado da rodada esteja correto
    config.stopClickedByMe = null; // Garante que o estado do STOP esteja correto
    io.to(room).emit("room_config", config); // Envia a config atualizada (com a letra)

    io.to(room).emit("round_started", { duration: config.duration, letter: newLetter });
    console.log(`[Socket.io] Rodada iniciada *de fato* na sala ${room} com a letra ${newLetter}.`);

    config.roundTimerId = setTimeout(() => {
      console.log(`[Socket.io] ⏱️ Tempo esgotado para a sala ${room}.`);
      io.to(room).emit("round_ended");
      if (config.roundTimerId) clearTimeout(config.roundTimerId);
      config.roundTimerId = null;
      config.roundActive = false;
      config.roundEnded = true; // Marca a rodada como encerrada
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
    config.roundEnded = true; // Marca a rodada como encerrada
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
      roomConfigs[room].roundEnded = false; // Reseta o estado da rodada
      roomConfigs[room].stopClickedByMe = null; // Reseta quem clicou STOP
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

    // Limpa todos os dados da sala ao final do jogo
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

  socket.on("leave_room", () => { // Novo evento para quando o usuário sai explicitamente
    const userId = socket.userId;
    const room = socket.room;

    if (!userId || !room) {
      console.log(`[Socket.io] leave_room: Socket não identificado (userId: ${userId}, room: ${room}).`);
      return;
    }

    if (players[userId] && players[userId].room === room) {
      delete players[userId];
      socket.leave(room); // Remove o socket da sala
      console.log(`[Socket.io] Jogador ${userId} saiu explicitamente da sala ${room}.`);
    } else {
      console.warn(`[Socket.io] Jogador ${userId} tentou sair da sala ${room}, mas não foi encontrado ou não pertence a esta sala.`);
    }

    const playersInRoom = Object.values(players).filter((p) => p.room === room);
    io.to(room).emit("players_update", playersInRoom);

    if (playersInRoom.length === 0) {
      console.log(`[Socket.io] Sala ${room} vazia após saída. Limpando dados da sala.`);
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
      // Lógica para transferir o criador se o criador atual sair
      const currentCreatorId = roomConfigs[room]?.creatorId;
      if (currentCreatorId === userId && playersInRoom.length > 0) {
        const newCreator = playersInRoom[0];
        roomConfigs[room].creatorId = newCreator.userId;
        players[newCreator.userId].isCreator = true; // Garante que o novo criador seja marcado como tal
        console.log(`[Socket.io] Novo criador da sala ${room} é ${newCreator.nickname} (${newCreator.userId}).`);

        io.to(room).emit("players_update", playersInRoom.map(p => ({
          id: p.id, nickname: p.nickname, userId: p.userId, isCreator: p.userId === newCreator.userId
        })));
        io.to(room).emit("room_config", roomConfigs[room]);
      }
    }
  });


  socket.on("disconnect", () => {
    const userId = socket.userId;
    const room = socket.room;

    if (!userId || !room) {
      console.log(`[Socket.io] Desconexão de socket não identificado (userId: ${userId}, room: ${room}).`);
      return;
    }

    // Não remove o jogador imediatamente do `players` aqui.
    // A lógica de reingresso ou de `leave_room` lidará com isso.
    // Se o jogador reconectar, o `rejoin_room` atualizará o socket.id.
    // Se o jogador sair explicitamente, o `leave_room` o removerá.
    // Se o socket desconectar e não houver reingresso em um tempo,
    // o servidor pode eventualmente limpar jogadores inativos se necessário,
    // mas para recargas, queremos mantê-los.

    console.log(`[Socket.io] Socket ${socket.id} (usuário ${userId}) desconectado da sala ${room}.`);

    // Apenas atualiza a lista de jogadores para os demais,
    // sem remover o jogador do registro global `players` ainda.
    const playersInRoom = Object.values(players).filter((p) => p.room === room);
    io.to(room).emit("players_update", playersInRoom);

    // Se a sala ficar vazia após uma desconexão (e não houver reingresso),
    // a sala será limpa. Isso é importante para evitar salas fantasmas.
    // No entanto, para persistência, o `players` ainda manterá o registro do userId.
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
      // Lógica para transferir o criador se o criador atual desconectar e a sala não ficar vazia
      const currentCreatorId = roomConfigs[room]?.creatorId;
      if (currentCreatorId === userId && playersInRoom.length > 0) {
        const newCreator = playersInRoom[0];
        roomConfigs[room].creatorId = newCreator.userId;
        players[newCreator.userId].isCreator = true; // Garante que o novo criador seja marcado como tal
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
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
