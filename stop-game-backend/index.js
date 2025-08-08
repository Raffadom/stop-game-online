require('dotenv').config(); // Adicione esta linha no topo!

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const admin = require('firebase-admin'); // Importa o SDK Admin do Firebase

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

// --- INICIALIZAÇÃO DO FIREBASE ADMIN SDK ---
// IMPORTANT: Substitua com suas credenciais do Firebase Admin SDK.
// Em produção, esses valores devem vir de variáveis de ambiente.
// Exemplo:
// const serviceAccount = require('./path/to/your-serviceAccountKey.json');
// Ou de variáveis de ambiente (recomendado para segurança):
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID || "your-firebase-project-id", // Substitua pelo ID do seu projeto
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || "your-firebase-private-key").replace(/\\n/g, '\n'), // Substitua pela sua chave privada
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "your-firebase-client-email", // Substitua pelo seu email de cliente
};

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase Admin SDK inicializado com sucesso!");
} catch (e) {
  if (!/already exists/.test(e.message)) { // Evita erro se já estiver inicializado (por ex., em hot-reload)
    console.error("❌ Erro ao inicializar Firebase Admin SDK:", e.message);
  }
}

const db = admin.firestore();

// Usando um appId para a estrutura de dados (como nas instruções de Firestore)
const appId = "stop-game-app"; // Pode ser definido via variável de ambiente ou constante
const roomsCollectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('rooms');

// --- Funções Auxiliares do Firestore ---
async function saveRoomConfigToFirestore(roomId, config) {
  try {
    const docRef = roomsCollectionRef.doc(roomId);
    await docRef.set(config, { merge: true }); // 'merge: true' para atualizar campos existentes e adicionar novos
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

// --- Variáveis de Estado do Jogo (em memória) ---
const players = {}; // userId -> { id: socket.id, nickname, room, isCreator, userId }
const roomsAnswers = {}; // room -> [{ id: userId, nickname, answers: [{ theme, answer, points }] }]
const stopCallers = {}; // room -> userId do jogador que clicou STOP
const validationStates = {}; // room -> { currentPlayerIndex, currentThemeIndex, validatorId, roundLetter }
const roomConfigs = {}; // room -> { themes: [], duration, creatorId, currentLetter, roundTimerId, roundActive, countdownTimerId, roundEnded, stopClickedByMe, isSaved }
const roomOverallScores = {}; // room -> { userId: totalScoreForGame }

// --- Eventos do Socket.IO ---
io.on("connection", (socket) => {
  socket.userId = null;
  socket.room = null;

  // NOVO: Evento para reingresso de usuários após recarga
  socket.on("rejoin_room", async ({ roomId, nickname, userId }) => { // Adicionado 'async'
    console.log(`[Socket.io] Tentativa de reingresso: Sala ${roomId}, Nickname ${nickname}, UserId ${userId}`);

    // Tentar carregar a configuração da sala do Firestore primeiro
    let configFromFirestore = await getRoomConfigFromFirestore(roomId);
    if (configFromFirestore) {
      // Se a sala for encontrada no Firestore, use essa config e marque-a como salva
      roomConfigs[roomId] = { ...configFromFirestore, isSaved: true };
    } else {
      // Se não for encontrada no Firestore, e também não estiver em memória, falha
      if (!roomConfigs[roomId]) {
        console.log(`[Socket.io] Reingresso falhou: Sala ${roomId} não encontrada em memória nem no Firestore.`);
        socket.emit('rejoin_room_fail');
        return;
      }
      // Se estiver em memória mas não no Firestore, não é considerada "salva"
      roomConfigs[roomId].isSaved = false;
    }

    const roomConfig = roomConfigs[roomId];

    // Verificar se o jogador existe no registro global de players
    const player = players[userId];
    if (!player || player.room !== roomId) {
      console.log(`[Socket.io] Reingresso falhou: Jogador ${nickname} (ID: ${userId}) não encontrado ou não pertence à sala ${roomId}.`);
      socket.emit('rejoin_room_fail');
      return;
    }

    // Atualizar o socket ID do jogador para o novo socket conectado
    player.id = socket.id; // Atualiza o socket.id do jogador para o novo socket
    player.nickname = nickname; // Garante que o nickname esteja atualizado
    socket.userId = userId; // Associa o userId ao novo socket
    socket.room = roomId; // Associa a sala ao novo socket

    // Fazer o novo socket entrar na sala
    socket.join(roomId);

    // Obter a lista atualizada de jogadores na sala
    const playersInRoom = Object.entries(players)
      .filter(([, p]) => p.room === roomId)
      .map(([uid, p]) => ({
        id: p.id,
        nickname: p.nickname,
        userId: uid,
        isCreator: p.isCreator,
      }));

    // Enviar os dados da sala e do jogador de volta para o cliente que reingressou
    socket.emit('rejoin_room_success', {
      room: {
        roomId: roomId,
        players: playersInRoom, // Envia a lista de jogadores atualizada
        config: roomConfig, // Inclui a configuração da sala (temas, duração, criador)
        currentLetter: roomConfig.currentLetter, // Inclui a letra atual da rodada
        roundStarted: roomConfig.roundActive, // Usa roundActive para indicar se a rodada está ativa
        roundEnded: roomConfig.roundEnded || false, // Adiciona o estado roundEnded
        stopClickedByMe: stopCallers[roomId] === userId, // Verifica se foi ele quem clicou STOP
        isSaved: roomConfig.isSaved || false, // Adiciona status de salvo
      },
      player: {
        userId: player.userId,
        nickname: player.nickname,
        isCreator: player.isCreator,
      }
    });

    // Notificar os outros jogadores na sala sobre a atualização da lista de jogadores
    io.to(roomId).emit("players_update", playersInRoom);
    console.log(`[Socket.io] Usuário ${nickname} (${userId}) reingresou com sucesso na sala ${roomId}.`);
  });

  socket.on("join_room", async ({ userId, room, nickname }) => { // Adicionado 'async'
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

    // Tenta carregar a configuração da sala do Firestore
    let configFromFirestore = await getRoomConfigFromFirestore(room);

    if (configFromFirestore) {
      // Sala encontrada no Firestore, carrega a config e marca como salva
      roomConfigs[room] = { ...configFromFirestore, isSaved: true };
      roomIsSaved = true;
      // Determina se é criador com base na config salva
      isCreator = (roomConfigs[room].creatorId === userId);
      // Se o jogador existente estiver entrando, apenas atualiza o socket.id
      if (existingPlayer && existingPlayer.room === room) {
        existingPlayer.id = socket.id;
        existingPlayer.nickname = nickname;
        console.log(`[Socket.io] Jogador existente ${nickname} (${userId}) reconectado na sala ${room} (via Firestore).`);
      } else {
        // Novo jogador entrando em sala existente do Firestore
        players[userId] = { id: socket.id, nickname, room, isCreator: isCreator, userId };
        console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room} (via Firestore). É criador: ${isCreator}`);
      }

    } else {
      // Sala NÃO encontrada no Firestore
      const roomHasCreator = Object.values(players).some((p) => p.room === room && p.isCreator);
      isCreator = !roomHasCreator; // O primeiro a entrar será o criador em memória

      if (existingPlayer && existingPlayer.room === room) {
        existingPlayer.id = socket.id;
        existingPlayer.nickname = nickname;
        console.log(`[Socket.io] Jogador existente ${nickname} (${userId}) reconectado na sala ${room} (em memória).`);
      } else {
        players[userId] = { id: socket.id, nickname, room, isCreator, userId };
        console.log(`[Socket.io] ${nickname} (${userId}) entrou na sala ${room} (nova/em memória). É criador: ${isCreator}`);
      }

      if (!roomConfigs[room]) { // Se a sala não existe nem em memória
        roomConfigs[room] = {
          themes: ["País", "Cidade", "Nome", "Marca", "Cor", "Animal"], // Temas padrão
          duration: 60,
          creatorId: userId,
          currentLetter: null,
          roundActive: false,
          countdownTimerId: null,
          roundEnded: false,
          stopClickedByMe: null,
          isSaved: false, // Inicialmente não salva no Firestore
        };
        // Se este é o criador da sala e a sala é nova, salva no Firestore (opcional, pode ser só no botão salvar)
        // No entanto, o requisito é "todas as configurações feitas pelo adm devem ser salvas automaticamente",
        // então é melhor salvar ao criar, e em cada update_config
        await saveRoomConfigToFirestore(room, roomConfigs[room]);
        roomConfigs[room].isSaved = true; // Marca como salvo após a primeira criação no Firestore
        roomIsSaved = true;

      } else if (isCreator && roomConfigs[room].creatorId === undefined) {
        roomConfigs[room].creatorId = userId; // Atribui criador se não tiver
        await saveRoomConfigToFirestore(room, roomConfigs[room]); // Salva update do criador
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
      isSaved: roomIsSaved, // Envia o status de salvo
    });
  });

  // NOVO: Evento para salvar a sala manualmente
  socket.on("save_room", async ({ room }) => { // Adicionado 'async'
    const userId = socket.userId;
    if (!room || !roomConfigs[room]) {
      console.warn(`[Socket.io] save_room: Sala indefinida ou não existe para ${userId}.`);
      return;
    }
    const config = roomConfigs[room];
    if (config.creatorId === userId) {
      await saveRoomConfigToFirestore(room, config);
      config.isSaved = true; // Atualiza o status em memória
      io.to(room).emit("room_config", config); // Notifica a sala sobre o status salvo
      console.log(`[Socket.io] Sala ${room} salva manualmente por ${userId}.`);
    } else {
      console.warn(`[Socket.io] save_room: ${userId} não é o criador da sala ${room}.`);
    }
  });


  socket.on("update_config", async ({ room, duration, themes }) => { // Adicionado 'async'
    const userId = socket.userId;
    if (!room) {
      console.warn(`[Socket.io] update_config: Sala indefinida para ${userId}.`);
      return;
    }
    const config = roomConfigs[room];
    if (config && config.creatorId === userId) {
      if (duration !== undefined) config.duration = duration;
      if (themes !== undefined) config.themes = themes;
      await saveRoomConfigToFirestore(room, config); // Salva as alterações no Firestore
      io.to(room).emit("room_config", config);
      console.log(`[Socket.io] Configuração da sala ${room} atualizada por ${userId} e salva no Firestore.`);
    } else {
      console.warn(`[Socket.io] update_config: ${userId} não é o criador ou sala ${room} não encontrada.`);
    }
  });

  socket.on("start_round", async ({ room }) => { // Adicionado 'async'
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
    config.roundEnded = false;
    config.stopClickedByMe = null;
    config.currentLetter = null; // Garante que a letra seja nula durante o countdown

    await saveRoomConfigToFirestore(room, config); // Salva o estado da rodada
    io.to(room).emit("room_config", config); // Atualiza clientes com a config resetada

    io.to(room).emit("round_start_countdown", { initialCountdown: 3 });
    console.log(`[Socket.io] Iniciando contagem regressiva para a rodada na sala ${room}.`);

    config.countdownTimerId = setTimeout(() => {
      config.countdownTimerId = null;
      console.log(`[Socket.io] Backend: Countdown para sala ${room} finalizado.`);
    }, 3000);
  });

  socket.on("start_game_actual", async ({ room }) => { // Adicionado 'async'
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
    await saveRoomConfigToFirestore(room, config); // Salva o estado da rodada no Firestore
    io.to(room).emit("room_config", config); // Envia a config atualizada (com a letra)

    io.to(room).emit("round_started", { duration: config.duration, letter: newLetter });
    console.log(`[Socket.io] Rodada iniciada *de fato* na sala ${room} com a letra ${newLetter}.`);

    config.roundTimerId = setTimeout(async () => { // Adicionado 'async' aqui para o setTimeout
      console.log(`[Socket.io] ⏱️ Tempo esgotado para a sala ${room}.`);
      io.to(room).emit("round_ended");
      if (config.roundTimerId) clearTimeout(config.roundTimerId);
      config.roundTimerId = null;
      config.roundActive = false;
      config.roundEnded = true; // Marca a rodada como encerrada
      config.currentLetter = null; // Limpa a letra após a rodada
      await saveRoomConfigToFirestore(room, config); // Salva o estado final da rodada
      initiateValidationAfterDelay(room);
    }, config.duration * 1000);
  });

  socket.on("stop_round", async () => { // Adicionado 'async'
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
    config.stopClickedByMe = socket.userId; // Salva quem clicou STOP
    config.currentLetter = null; // Limpa a letra
    await saveRoomConfigToFirestore(room, config); // Salva o estado da rodada no Firestore
    io.to(room).emit("room_ended"); // Usa room_ended para consistência com o front
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

  // A validação de respostas e o next_validation não precisam salvar no Firestore a cada passo,
  // pois a pontuação final será salva.

  socket.on("reset_round_data", async () => { // Adicionado 'async'
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
      await saveRoomConfigToFirestore(room, roomConfigs[room]); // Salva o estado resetado
      io.to(room).emit("room_reset_ack");
      io.to(room).emit("room_config", roomConfigs[room]);
    }
  });

  socket.on("end_game", async () => { // Adicionado 'async'
    const room = socket.room;
    if (!room) return;
    const finalScores = Object.entries(roomOverallScores[room] || {}).map(([userId, total]) => {
      const nickname = players[userId]?.nickname || `Jogador Desconhecido (${userId.substring(0, 4)}...)`;
      return { nickname, total };
    });

    const ranking = finalScores.sort((a, b) => b.total - a.total);
    io.to(room).emit("game_ended", ranking);

    // NÃO DELETAR roomConfigs[room] aqui para permitir persistência.
    // Apenas resetar o estado do jogo na roomConfig
    if (roomConfigs[room]) {
        roomConfigs[room].currentLetter = null;
        roomConfigs[room].roundActive = false;
        roomConfigs[room].roundEnded = false;
        roomConfigs[room].stopClickedByMe = null;
        await saveRoomConfigToFirestore(room, roomConfigs[room]); // Salva o estado resetado do jogo
    }
    
    // Deleta dados efêmeros da sala (respostas, chamadores de stop, etc.)
    delete roomsAnswers[room];
    delete stopCallers[room];
    delete validationStates[room];
    delete roomOverallScores[room]; // Limpa placares totais da partida

    // Limpa os players associados a esta sala, pois a partida terminou
    Object.keys(players).forEach(userId => {
        if (players[userId].room === room) {
            delete players[userId];
        }
    });

    console.log(`[Socket.io] Partida na sala ${room} encerrada. Configurações da sala mantidas, dados de jogo limpos.`);
  });

  socket.on("leave_room", async () => { // Adicionado 'async'
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
      console.log(`[Socket.io] Sala ${room} vazia após saída.`);
      // NÃO DELETAR roomConfigs[room] do in-memory aqui se ele for salvo no Firestore
      // Apenas garantir que os timers sejam limpos para evitar vazamentos
      if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
        clearTimeout(roomConfigs[room].roundTimerId);
        roomConfigs[room].roundTimerId = null;
      }
      if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
        clearTimeout(roomConfigs[room].countdownTimerId);
        roomConfigs[room].countdownTimerId = null;
      }
      // Deleta dados efêmeros da sala (respostas, chamadores de stop, etc.)
      delete roomsAnswers[room];
      delete stopCallers[room];
      delete validationStates[room];
      delete roomOverallScores[room];
      // A roomConfig em si (themes, duration, etc.) PERMANECE no Firestore e em memória
    } else {
      // Lógica para transferir o criador se o criador atual sair
      const currentCreatorId = roomConfigs[room]?.creatorId;
      if (currentCreatorId === userId && playersInRoom.length > 0) {
        const newCreator = playersInRoom[0];
        roomConfigs[room].creatorId = newCreator.userId;
        players[newCreator.userId].isCreator = true; // Garante que o novo criador seja marcado como tal
        await saveRoomConfigToFirestore(room, roomConfigs[room]); // Salva a atualização do criador
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

    // Não remove o jogador de `players` aqui para permitir reingresso em recargas
    console.log(`[Socket.io] Socket ${socket.id} (usuário ${userId}) desconectado da sala ${room}.`);

    const playersInRoom = Object.values(players).filter((p) => p.room === room);
    io.to(room).emit("players_update", playersInRoom);

    if (playersInRoom.length === 0) {
      console.log(`[Socket.io] Sala ${room} vazia após desconexão. Limpando dados de jogo efêmeros.`);
      delete roomsAnswers[room];
      delete stopCallers[room];
      delete validationStates[room];
      delete roomOverallScores[room];
      // A roomConfig em si (themes, duration, etc.) PERMANECE no Firestore e em memória
      // se foi salva, permitindo que a sala seja reaberta com suas configs
      if (roomConfigs[room] && roomConfigs[room].roundTimerId) {
        clearTimeout(roomConfigs[room].roundTimerId);
        roomConfigs[room].roundTimerId = null;
      }
      if (roomConfigs[room] && roomConfigs[room].countdownTimerId) {
        clearTimeout(roomConfigs[room].countdownTimerId);
        roomConfigs[room].countdownTimerId = null;
      }
    } else {
      // Lógica para transferir o criador se o criador atual desconectar e a sala não ficar vazia
      const currentCreatorId = roomConfigs[room]?.creatorId;
      if (currentCreatorId === userId && playersInRoom.length > 0) {
        const newCreator = playersInRoom[0];
        roomConfigs[room].creatorId = newCreator.userId;
        players[newCreator.userId].isCreator = true; // Garante que o novo criador seja marcado como tal
        // Salva a atualização do criador no Firestore
        if (roomConfigs[room].isSaved) { // Só salva se a sala já estiver marcada como salva
          saveRoomConfigToFirestore(room, roomConfigs[room]);
        }
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
