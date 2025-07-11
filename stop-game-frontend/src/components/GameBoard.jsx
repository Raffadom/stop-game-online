import { useEffect, useState, useRef } from "react";
import { socket } from "../socket";
import Modal from "./Modal"; // Certifique-se de que o caminho para o Modal está correto

export default function GameBoard({
  roundStarted,
  roundEnded,
  onResetRound,
  resetRoundFlag,
  letter,
  isAdmin,
  userId,
  roomThemes, // Esta prop é crucial e deve vir do Room.jsx
  // roomDuration, // Não usado diretamente aqui, mantido para referência se necessário
  setRoomThemes, // <--- NOVA PROP: Passada do Room.jsx para atualizar os temas no App.jsx
}) {
  const maxThemes = 10; // Renomeado para maxThemes para ser mais claro
  const [answers, setAnswers] = useState([]); // Renomeei 'fields' para 'answers' para maior clareza
  const [newThemeInput, setNewThemeInput] = useState(""); // Estado para o input de novo tema

  const [totalPoints, setTotalPoints] = useState(null);
  const [showResults, setShowResults] = useState(false); // Refere-se aos resultados DA RODADA
  const [finalRanking, setFinalRanking] = useState(null); // Refere-se ao ranking FINAL da partida

  const [showModal, setShowModal] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [canReveal, setCanReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [playerOverallScore, setPlayerOverallScore] = useState(0);

  // Ref para as respostas atuais para serem usadas em callbacks do socket
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Efeito para inicializar/atualizar as respostas com base nos temas da sala
  useEffect(() => {
    // Se a lista de temas da sala mudou, ou se as respostas ainda não foram inicializadas,
    // ou se o resetRoundFlag foi acionado.
    const themesChanged =
      JSON.stringify(roomThemes) !== JSON.stringify(answers.map((a) => a.theme));

    if (roomThemes && roomThemes.length > 0 && (themesChanged || answers.length === 0)) {
      console.log("GameBoard: Inicializando/Atualizando respostas com temas da sala:", roomThemes);
      setAnswers(
        roomThemes.map((theme) => ({
          theme: theme,
          answer: "",
          points: null,
          validated: false,
        }))
      );
    } else if (
      !isAdmin &&
      !roundStarted &&
      !roundEnded &&
      answers.length === 0
    ) {
      // Para jogadores não-admin que ainda não receberam temas,
      // garante que eles vejam pelo menos um campo vazio enquanto aguardam.
      console.log(
        "GameBoard: Inicializando com um campo vazio para jogador não-admin, aguardando temas."
      );
      setAnswers([{ theme: "", answer: "", points: null, validated: false }]);
    }
  }, [roomThemes, isAdmin, roundStarted, roundEnded]);


  // Efeito para resetar a rodada (quando o admin clica em 'Nova Rodada')
  useEffect(() => {
    if (resetRoundFlag) {
      console.log(
        "🔄 GameBoard: resetRoundFlag ativada. Reiniciando estados e campos de tema."
      );
      // Reinicia as respostas com base nos temas atuais da sala
      setAnswers(
        roomThemes.map((theme) => ({
          theme: theme,
          answer: "",
          points: null,
          validated: false,
        }))
      );
      setTotalPoints(null);
      setShowResults(false); // Esconde resultados da rodada anterior
      setFinalRanking(null); // Limpa ranking final
      setShowModal(false); // Fecha qualquer modal de validação/ranking
      setValidationData(null);
      setCanReveal(false);
      setRevealed(false);
      setPlayerOverallScore(0);
      onResetRound(); // Avisa ao App.jsx que o reset foi processado (zera a flag)
    }
  }, [resetRoundFlag, onResetRound, roomThemes]);

  // Event Listeners para Socket.IO
  useEffect(() => {
    const handleRoundEnded = () => {
      console.log("🔔 Evento round_ended recebido — enviando respostas...");
      // Envia as respostas APENAS se a rodada estava ativa
      if (roundStarted) {
        socket.emit("submit_answers", answersRef.current);
      }
    };

    const handleGameEnded = (ranking) => {
      console.log("🎉 game_ended recebido, ranking final:", ranking);
      setFinalRanking(ranking);
      setShowModal(true); // Abre o modal para mostrar o ranking final
      setShowResults(false); // Garante que a seção de resultados da rodada não esteja visível
    };

    const handleStartValidation = ({ current, judgeId }) => {
      console.log("📨 start_validation recebido:", current, " | Juiz Socket ID:", judgeId);
      setShowModal(true);
      setValidationData(current); // current já contém isLastAnswerOfTheme e isLastAnswerOfGame
      setCanReveal(socket.id === judgeId);
      setRevealed(false);
      setShowResults(false); // Esconde resultados anteriores
      setTotalPoints(null); // Limpa pontos anteriores
    };

    const handleRevealAnswer = () => setRevealed(true);

    const handleAnswerValidated = ({ current }) => {
      console.log("✅ answer_validated recebido:", current);
      setAnswers((prevAnswers) =>
        prevAnswers.map((a, i) =>
          i === current.themeIndex ? { ...a, points: current.points, validated: current.validated } : a
        )
      );
      setValidationData(current); // Atualiza validationData para renderizar os pontos na modal
      setRevealed(false); // Reseta para o próximo reveal
    };

    const handleAllAnswersValidated = (allPlayersRoundScores) => {
      console.log("🏁 Todas as respostas validadas!", allPlayersRoundScores);
      const myScore = allPlayersRoundScores.find(
        (score) => score.userId === userId
      );
      if (myScore) {
        setTotalPoints(myScore.roundScore);
        setPlayerOverallScore(myScore.overallScore);
      }

      setShowModal(false); // Fecha o modal de validação
      setValidationData(null);
      setShowResults(true); // Mostra os resultados da rodada
    };

    socket.on("round_ended", handleRoundEnded);
    socket.on("game_ended", handleGameEnded);
    socket.on("start_validation", handleStartValidation);
    socket.on("reveal_answer", handleRevealAnswer);
    socket.on("answer_validated", handleAnswerValidated);
    socket.on("all_answers_validated", handleAllAnswersValidated);

    return () => {
      socket.off("round_ended", handleRoundEnded);
      socket.off("game_ended", handleGameEnded);
      socket.off("start_validation", handleStartValidation);
      socket.off("reveal_answer", handleRevealAnswer);
      socket.off("answer_validated", handleAnswerValidated);
      socket.off("all_answers_validated", handleAllAnswersValidated);
    };
  }, [userId, roundStarted, answers]); // Adicionei 'answers' aqui para que answersRef.current esteja sempre atualizado antes de handleRoundEnded ser chamado

  // Handler para mudança de resposta em um campo
  const handleAnswerInputChange = (index, value) => {
    const newAnswers = [...answers];
    newAnswers[index].answer = value;
    setAnswers(newAnswers);
  };

  // Handler para adicionar um novo tema
  const handleAddTheme = () => {
    const trimmedTheme = newThemeInput.trim();
    if (trimmedTheme && !roomThemes.includes(trimmedTheme) && roomThemes.length < maxThemes) {
      const updatedThemes = [...roomThemes, trimmedTheme];
      setRoomThemes(updatedThemes); // Chama a prop para atualizar os temas no App.jsx/backend
      setNewThemeInput(""); // Limpa o input
    }
  };

  // Handler para remover um tema existente
  const handleRemoveTheme = (themeToRemove) => {
    if (roomThemes.length > 1) { // Garante que pelo menos um tema permaneça
      const updatedThemes = roomThemes.filter((theme) => theme !== themeToRemove);
      setRoomThemes(updatedThemes); // Chama a prop para atualizar os temas no App.jsx/backend
    }
  };

  const handleNewRound = () => {
    // Este botão é visível apenas após a validação completa da rodada,
    // então ele deve iniciar um ciclo de reset no App.jsx
    socket.emit("reset_round_data"); // Avisa o backend para resetar a sala
    // O resetRoundFlag no App.jsx será acionado pelo backend e então propagado para cá.
  };

  const handleEndGame = () => socket.emit("end_game");
  const handleReveal = () => socket.emit("reveal_answer");
  const handleValidation = (isValid) => socket.emit("validate_answer", { valid: isValid });
  const handleNext = () => socket.emit("next_validation");

  console.log("GameBoard Render: ", { isAdmin, roundStarted, roundEnded, answersLength: answers.length, showModal, validationData, showResults, finalRanking, roomThemes });

  return (
    <div className="w-full h-full flex flex-col space-y-6">
      {/* Letra da Rodada (visível apenas quando a rodada está ativa) */}
      {letter && roundStarted && !roundEnded && (
        <div className="text-center text-3xl font-bold mb-4 text-blue-700 select-none">
          Letra da rodada: <span className="text-5xl">{letter}</span>
        </div>
      )}

      {/* Seção de gerenciamento de temas (apenas para Admin e fora da rodada) */}
      {isAdmin && !roundStarted && !roundEnded && !finalRanking && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-xl font-semibold mb-3 text-gray-700">Gerenciar Temas</h3>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              placeholder="Novo Tema"
              value={newThemeInput}
              onChange={(e) => setNewThemeInput(e.target.value)}
              className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={handleAddTheme}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md shadow transition-colors"
              disabled={roomThemes.length >= maxThemes}
            >
              Adicionar Tema
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
            {roomThemes.map((theme, index) => (
              <span
                key={theme + index} // Chave mais robusta
                className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
              >
                {theme}
                {roomThemes.length > 1 && ( // Só permite remover se houver mais de 1 tema
                  <button
                    onClick={() => handleRemoveTheme(theme)}
                    className="ml-2 text-blue-600 hover:text-blue-900 focus:outline-none"
                    title="Remover tema"
                  >
                    &times;
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Campos de Resposta (visível se não houver ranking final) */}
      {!finalRanking && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-h-[450px] overflow-y-auto">
            {answers.map((answerItem, i) => (
              <div
                key={answerItem.theme + i} // Use theme + index para chave única
                className="flex flex-col bg-gray-50 p-4 rounded shadow-sm min-w-[200px]"
              >
                <label className="block text-gray-700 font-medium mb-1 truncate" title={answerItem.theme}>
                  {answerItem.theme}
                </label>
                <input
                  type="text"
                  placeholder="Sua resposta"
                  value={answerItem.answer}
                  disabled={!roundStarted || roundEnded} // Desabilita se a rodada não começou ou terminou
                  onChange={(e) => handleAnswerInputChange(i, e.target.value)}
                  className="mb-2 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                {showResults && answerItem.points !== null && (
                  <div className="text-sm text-right font-semibold"
                       style={{ color: answerItem.points > 0 ? '#10B981' : '#EF4444' }}> {/* Tailwind colors: green-500, red-500 */}
                    Pontos: {answerItem.points}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Botão de Submeter Respostas (visível apenas durante a rodada ativa) */}
          {roundStarted && !roundEnded && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => socket.emit("submit_answers", answers)} // Envia as respostas ao clicar
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 font-semibold w-full max-w-xs"
              >
                Submeter Respostas
              </button>
            </div>
          )}

          {/* Resultados da Rodada (visível após a validação) */}
          {showResults && totalPoints !== null && (
            <div className="text-center mt-4">
              <div className="text-2xl font-bold text-purple-700">
                Total da Rodada: {totalPoints} pontos
              </div>
              <div className="text-xl font-bold text-gray-800 mt-2">
                Total da Partida: {playerOverallScore} pontos
              </div>
              <div className="flex justify-center space-x-6 mt-4">
                <button
                  onClick={handleNewRound}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2 rounded shadow transition-colors duration-200"
                >
                  Nova Rodada
                </button>
                <button
                  onClick={handleEndGame}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded shadow transition-colors duration-200"
                >
                  Encerrar Partida
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ranking Final da Partida (visível quando finalRanking está preenchido) */}
      {finalRanking && (
        <div className="w-full max-h-[500px] overflow-auto bg-white p-6 rounded-xl shadow-lg mt-8">
          <h3 className="text-3xl font-bold mb-6 text-center text-blue-800">
            🏆 Ranking Final da Partida 🏆
          </h3>
          <ol className="list-decimal list-inside space-y-3 text-xl">
            {finalRanking.map((player, idx) => (
              <li
                key={player.nickname}
                className={`p-4 rounded-lg flex justify-between items-center ${
                  idx === 0
                    ? "bg-yellow-400 text-gray-900 font-extrabold shadow-lg transform scale-105"
                    : "bg-gray-100 text-gray-800"
                } transition-all duration-300`}
              >
                <span>
                  {idx + 1}. {player.nickname}
                </span>{" "}
                <span className="font-bold text-2xl">
                  {player.total} pontos
                </span>
                {idx === 0 && (
                  <span className="ml-3 text-3xl animate-bounce">🥇</span>
                )}
              </li>
            ))}
          </ol>
          <div className="flex justify-center mt-8">
            <button
              onClick={() => window.location.reload()} // Recarrega a página para iniciar novo jogo
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 text-lg"
            >
              Jogar Novamente / Voltar ao Lobby
            </button>
          </div>
        </div>
      )}

      {/* Modal de Validação (visível durante o processo de validação) */}
      {showModal && validationData && !finalRanking && (
        <Modal onClose={() => {}} showClose={false}>
          <div className="space-y-6">
            <h4 className="text-2xl font-bold text-center text-blue-700">
              Validando Resposta
            </h4>
            <div className="text-xl font-semibold text-center text-gray-800">
              Jogador: {validationData.playerNickname}
            </div>
            <div className="text-xl font-semibold text-center text-gray-800">
              Tema: {validationData.theme}
            </div>

            {revealed ? (
              <>
                <div className="text-center text-2xl text-gray-900 font-bold">
                  Resposta:{" "}
                  <span className="text-blue-600">{validationData.answer || "(Resposta vazia)"}</span>
                </div>

                {validationData.validated ? (
                  <div className="text-center text-xl font-bold mt-4">
                    Pontos:{" "}
                    <span
                      className={
                        validationData.points > 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {validationData.points}
                    </span>
                  </div>
                ) : (
                  canReveal && (
                    <div className="flex justify-center space-x-4 mt-6">
                      <button
                        onClick={() => handleValidation(true)}
                        className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg shadow-md transition-colors duration-200"
                      >
                        Validar
                      </button>
                      <button
                        onClick={() => handleValidation(false)}
                        className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg shadow-md transition-colors duration-200"
                      >
                        Anular
                      </button>
                    </div>
                  )
                )}

                {canReveal && validationData.validated && (
                  <div className="flex justify-center mt-6">
                    {validationData.isLastAnswerOfGame ? (
                      <button
                        onClick={handleNext}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors duration-200"
                      >
                        Finalizar Correção
                      </button>
                    ) : validationData.isLastAnswerOfTheme ? (
                      <button
                        onClick={handleNext}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors duration-200"
                      >
                        Próximo Tema
                      </button>
                    ) : (
                      <button
                        onClick={handleNext}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors duration-200"
                      >
                        Próximo Jogador
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-center mt-6">
                {canReveal ? (
                  <button
                    onClick={handleReveal}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors duration-200"
                  >
                    Mostrar Resposta
                  </button>
                ) : (
                  <p className="text-center text-lg text-gray-500 italic">
                    Aguardando o juiz revelar a resposta...
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}