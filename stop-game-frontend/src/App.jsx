import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from './socket';
import Home from './components/Home';
import Room from './components/Room';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState('');
  const [userId, setUserId] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isInRoom, setIsInRoom] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [playersInRoom, setPlayersInRoom] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Estados relacionados ao jogo
  const [roomThemes, setRoomThemes] = useState([]);
  const [roomDuration, setRoomDuration] = useState(60);
  const [letter, setLetter] = useState(null);
  const [roundStarted, setRoundStarted] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [resetRoundFlag, setResetRoundFlag] = useState(false);
  const [stopClickedByMe, setStopClickedByMe] = useState(false);

  // Estado e ref para o countdown de início de rodada
  const [countdown, setCountdown] = useState(null);
  const countdownIntervalRef = useRef(null);

  const clearLocalCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startLocalCountdown = useCallback((initialValue, onCompleteCallback) => {
    clearLocalCountdown();
    setCountdown(initialValue);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          return null;
        }
        if (prev === 1) {
          clearLocalCountdown();
          if (onCompleteCallback) onCompleteCallback();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearLocalCountdown]);

  // --- NOVO: Efeito para lidar com a persistência e reconexão ---
  useEffect(() => {
    let currentUserId = localStorage.getItem('userId');
    if (!currentUserId) {
      currentUserId = uuidv4();
      localStorage.setItem('userId', currentUserId);
    }
    setUserId(currentUserId);

    // Tenta reingressar em uma sala se os dados existirem no localStorage
    const savedRoomId = localStorage.getItem('roomId');
    const savedNickname = localStorage.getItem('nickname');
    // Já temos currentUserId do bloco acima

    if (savedRoomId && savedNickname && currentUserId) {
      console.log(`Tentando reingressar na sala ${savedRoomId} como ${savedNickname} (ID: ${currentUserId})...`);
      // Emite 'rejoin_room' apenas se o socket já estiver conectado
      // Caso contrário, será tratado pelo listener 'onConnect'
      if (socket.connected) {
        socket.emit('rejoin_room', {
          roomId: savedRoomId,
          nickname: savedNickname,
          userId: currentUserId,
        });
      } else {
        console.log("Socket ainda não conectado, tentará reingresso após a conexão.");
      }
    }

    // Listener para reingresso bem-sucedido
    const onRejoinRoomSuccess = (data) => {
      console.log('Reingresso bem-sucedido!', data);
      setIsInRoom(true);
      setRoom(data.room.roomId);
      setNickname(data.player.nickname); // Garante que o nickname seja definido pelos dados do jogador reingressado
      setUserId(data.player.userId); // Garante que o userId seja definido pelos dados do jogador reingressado
      setPlayersInRoom(data.room.players);
      setIsAdmin(data.player.isCreator);
      setRoomThemes(data.room.config.themes || []);
      setRoomDuration(data.room.config.duration || 60);
      setLetter(data.room.currentLetter || null); // Restaura a letra atual se disponível
      setRoundStarted(data.room.roundStarted || false); // Restaura o estado da rodada
      setRoundEnded(data.room.roundEnded || false); // Restaura o estado da rodada
      setStopClickedByMe(data.room.stopClickedByMe || false); // Restaura o estado do STOP
      setRoomError(null);
      setResetRoundFlag(false);
      clearLocalCountdown();
    };

    // Listener para reingresso falho
    const onRejoinRoomFail = () => {
      console.log('Reingresso falhou. Limpando local storage e resetando estado.');
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      // O userId pode ser válido para uma nova sala, então não o removemos aqui
      setIsInRoom(false);
      setRoom('');
      setNickname('');
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoomDuration(60);
      setLetter(null);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setRoomError("Não foi possível reentrar na sala. A sala pode não existir mais ou seus dados estão inválidos.");
      setResetRoundFlag(false);
      clearLocalCountdown();
    };

    socket.on('rejoin_room_success', onRejoinRoomSuccess);
    socket.on('rejoin_room_fail', onRejoinRoomFail);

    return () => {
      socket.off('rejoin_room_success', onRejoinRoomSuccess);
      socket.off('rejoin_room_fail', onRejoinRoomFail);
    };
  }, [userId, clearLocalCountdown]); // userId é uma dependência porque é usado na lógica de reingresso


  useEffect(() => {
    function onConnect() {
      console.log('Socket Conectado! ID:', socket.id);
      setIsConnected(true);
      // Após conectar, se houver dados de sala salvos, tenta reingressar
      const savedRoomId = localStorage.getItem('roomId');
      const savedNickname = localStorage.getItem('nickname');
      const currentUserId = localStorage.getItem('userId'); // Garante que temos o userId

      if (savedRoomId && savedNickname && currentUserId) {
        console.log(`Socket reconectado. Tentando reingressar na sala ${savedRoomId}...`);
        socket.emit('rejoin_room', {
          roomId: savedRoomId,
          nickname: savedNickname,
          userId: currentUserId,
        });
      }
    }

    function onDisconnect() {
      console.log('Socket Desconectado!');
      setIsConnected(false);
      // NÃO limpe o estado da sala aqui, pois pode ser uma desconexão temporária.
      // A lógica de `rejoin_room` no `onConnect` lidará com o restabelecimento
      // do estado da sala, ou `rejoin_room_fail` irá limpá-lo se necessário.
    }

    function onConnectError(err) {
      console.error("Erro de Conexão do Socket:", err.message, err);
      setIsConnected(false);
      setRoomError("Não foi possível conectar ao servidor. Verifique sua internet ou tente novamente mais tarde.");
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    setIsConnected(socket.connected);
    console.log("Estado Inicial do Socket:", socket.connected ? "Conectado" : "Desconectado");

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []); // Sem dependências, executa apenas uma vez na montagem


  useEffect(() => {
    function onRoomJoined(data) {
      setIsInRoom(true);
      setRoom(data.room);
      setNickname(data.player.nickname); // Define o nickname a partir dos dados do jogador
      setUserId(data.player.userId); // Define o userId a partir dos dados do jogador
      setPlayersInRoom(data.players);
      setIsAdmin(data.isCreator); // Backend envia 'isCreator'
      setRoomThemes(data.config.themes || []); // Temas estão em data.config
      setRoomDuration(data.config.duration || 60); // Duração está em data.config
      setRoomError(null);
      setResetRoundFlag(false);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setLetter(null);
      clearLocalCountdown();
      console.log("Entrou na sala:", data.room, "Jogadores:", data.players, "É Admin:", data.isCreator, "Temas:", data.config.themes, "Duração:", data.config.duration);

      // --- SALVAR NO LOCAL STORAGE AO ENTRAR NA SALA COM SUCESSO ---
      localStorage.setItem('roomId', data.room);
      localStorage.setItem('nickname', data.player.nickname);
      localStorage.setItem('userId', data.player.userId); // Garante que o userId também seja salvo
    }

    function onRoomError(message) {
      setRoomError(message);
      setIsInRoom(false);
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setLetter(null);
      clearLocalCountdown();
      // Em caso de erro na sala, limpa o local storage, pois a sala pode ser inválida
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      // Mantém o userId, pois é um ID do lado do cliente
    }

    function onPlayersUpdated(players) {
      setPlayersInRoom(players);
      const myPlayer = players.find(p => p.userId === userId); // Encontra pelo userId
      if (myPlayer) {
        setIsAdmin(myPlayer.isCreator); // Usa 'isCreator'
      }
      console.log("Jogadores atualizados:", players);
    }

    function onRoomConfigUpdated(config) {
      if (config.themes) {
        setRoomThemes(config.themes);
        console.log("Temas da sala atualizados:", config.themes);
      }
      if (config.duration) {
        setRoomDuration(config.duration);
        console.log("Duração da sala atualizada:", config.duration);
      }
      if (config.currentLetter) { // Se a letra for enviada na config (ex: após reset)
        setLetter(config.currentLetter);
      }
    }

    function onRoundStarted(data) {
      setLetter(data.letter);
      setRoundStarted(true);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setResetRoundFlag(false);
      clearLocalCountdown();
      console.log("Rodada iniciada! Letra:", data.letter);
    }

    // Listener para iniciar a contagem regressiva no frontend
    function onRoundStartCountdown(data) {
        console.log("Recebido round_start_countdown:", data.initialCountdown);
        setLetter(null); // Limpa a letra enquanto aguarda o countdown
        setRoundStarted(false);
        setRoundEnded(false);
        setStopClickedByMe(false);
        setResetRoundFlag(false);
        startLocalCountdown(data.initialCountdown, () => {
            console.log("Contagem regressiva local finalizada! Emitindo start_game_actual.");
            // Após a contagem regressiva local, avisamos o backend para iniciar a rodada de fato
            socket.emit("start_game_actual", { room });
        });
    }

    function onRoundEnded() { // Consolidado: atende tanto a STOP quanto a tempo
      setRoundEnded(true);
      setRoundStarted(false);
      setLetter(null);
      setStopClickedByMe(false);
      clearLocalCountdown(); // Garante que qualquer countdown pendente seja limpo
      console.log("Rodada encerrada (por STOP ou tempo).");
    }

    function onRoomResetAck() {
      console.log("Evento: room_reset_ack recebido. Preparando para nova rodada.");
      setResetRoundFlag(true); // Isso fará com que o GameBoard resete.
      setRoundStarted(false);
      setRoundEnded(false);
      setLetter(null);
      setStopClickedByMe(false);
      clearLocalCountdown();
      // Não limpa temas e duração aqui, pois eles podem ter sido atualizados e já virão no room_config
    }

    socket.on('room_joined', onRoomJoined);
    socket.on('room_error', onRoomError);
    socket.on('players_update', onPlayersUpdated);
    socket.on('room_config', onRoomConfigUpdated);
    socket.on('round_started', onRoundStarted);
    socket.on('round_start_countdown', onRoundStartCountdown);
    socket.on('round_ended', onRoundEnded);
    socket.on('room_reset_ack', onRoomResetAck);

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_error', onRoomError);
      socket.off('players_update', onPlayersUpdated);
      socket.off('room_config', onRoomConfigUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_start_countdown', onRoundStartCountdown);
      socket.off('round_ended', onRoundEnded);
      socket.off('room_reset_ack', onRoomResetAck);
    };
  }, [userId, clearLocalCountdown, startLocalCountdown, room]);

  // Handler para juntar ou criar uma sala
  const handleJoinOrCreateRoom = (roomName, playerNickname) => {
    if (socket.connected) {
      setNickname(playerNickname);
      setRoom(roomName);
      setRoomError(null); // Limpa qualquer erro anterior
      console.log(`Tentando entrar/criar sala: ${roomName} com nickname: ${playerNickname}`);
      socket.emit('join_room', { userId, room: roomName, nickname: playerNickname });
    } else {
      setRoomError("Conexão com o servidor não estabelecida. Tente novamente.");
      console.error("Socket não conectado, não é possível entrar na sala.");
    }
  };

  // Handler para atualizar temas e notificar o backend
  const handleChangeRoomThemes = useCallback((newThemes) => {
    if (isAdmin && room) {
      setRoomThemes(newThemes);
      socket.emit('update_config', { room, themes: newThemes });
      console.log("Emitindo update_config (themes) para sala:", room, newThemes);
    }
  }, [isAdmin, room]);

  // Handler para atualizar duração e notificar o backend
  const handleChangeRoomDuration = useCallback((newDuration) => {
    if (isAdmin && room) {
      setRoomDuration(newDuration);
      socket.emit('update_config', { room, duration: newDuration });
      console.log("Emitindo update_config (duration) para sala:", room, newDuration);
    }
  }, [isAdmin, room]);


  const handleStartRound = () => {
    if (isAdmin && !roundStarted && !roundEnded && !countdown) {
      socket.emit('start_round', { room }); // Inicia o countdown no backend
      console.log("Emitindo start_round (para iniciar contagem regressiva) para sala:", room);
    }
  };

  const handleStopRound = () => {
    if (roundStarted && !roundEnded && !stopClickedByMe) {
      socket.emit('stop_round');
      setStopClickedByMe(true);
      console.log("STOP clicado!");
    }
  };

  const handleLeaveRoom = () => {
    if (isInRoom) {
      socket.emit('leave_room'); // Informa o backend que o usuário está saindo
      // Limpa o estado local para voltar para a tela inicial
      setIsInRoom(false);
      setRoom('');
      setNickname('');
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoomDuration(60);
      setLetter(null);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setRoomError(null);
      setResetRoundFlag(false);
      clearLocalCountdown();
      // --- LIMPAR LOCAL STORAGE AO SAIR DA SALA ---
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      localStorage.removeItem('userId'); // Também limpa o userId se o usuário sair explicitamente
      console.log("Saiu da sala (estado do frontend limpo e localStorage removido).");
    }
  };

  const onResetRound = () => {
    console.log("onResetRound chamado do GameBoard. Definindo resetRoundFlag para false.");
    setResetRoundFlag(false);
  };

  if (!isInRoom) {
    return (
      <Home
        onJoinOrCreateRoom={handleJoinOrCreateRoom}
        roomError={roomError}
        isConnected={isConnected}
      />
    );
  } else {
    return (
      <Room
        nickname={nickname}
        room={room}
        userId={userId}
        playersInRoom={playersInRoom}
        isAdmin={isAdmin}
        roomThemes={roomThemes}
        setRoomThemes={handleChangeRoomThemes}
        roomDuration={roomDuration}
        setRoomDuration={handleChangeRoomDuration}
        letter={letter}
        roundStarted={roundStarted}
        roundEnded={roundEnded}
        resetRoundFlag={resetRoundFlag}
        stopClickedByMe={stopClickedByMe}
        countdown={countdown}
        handleStartRound={handleStartRound}
        handleStopRound={handleStopRound}
        handleLeaveRoom={handleLeaveRoom}
        onResetRound={onResetRound}
      />
    );
  }
}

export default App;
