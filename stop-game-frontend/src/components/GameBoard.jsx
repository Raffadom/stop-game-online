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
  setRoomThemes, // <--- NOVA PROP: Passada do Room.jsx para atualizar os temas no App.jsx
}) {
  const maxThemes = 10;
  const [answers, setAnswers] = useState([]);
  const [newThemeInput, setNewThemeInput] = useState("");

  const [totalPoints, setTotalPoints] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [finalRanking, setFinalRanking] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [canReveal, setCanReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // NOVO ESTADO: Controla se a resposta atual da modal já foi validada
  const [currentAnswerValidatedInModal, setCurrentAnswerValidatedInModal] = useState(false);

  const [playerOverallScore, setPlayerOverallScore] = useState(0);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
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
      console.log(
        "GameBoard: Inicializando com um campo vazio para jogador não-admin, aguardando temas."
      );
      setAnswers([{ theme: "", answer: "", points: null, validated: false }]);
    }
  }, [roomThemes, isAdmin, roundStarted, roundEnded, answers.length]); // Adicionado answers.length como dependência

  useEffect(() => {
    if (resetRoundFlag) {
      console.log(
        "🔄 GameBoard: resetRoundFlag ativada. Reiniciando estados e campos de tema."
      );
      setAnswers(
        roomThemes.map((theme) => ({
          theme: theme,
          answer: "",
          points: null,
          validated: false,
        }))
      );
      setTotalPoints(null);
      setShowResults(false);
      setFinalRanking(null);
      setShowModal(false);
      setValidationData(null);
      setCanReveal(false);
      setRevealed(false);
      setCurrentAnswerValidatedInModal(false); // Resetar este estado também
      setPlayerOverallScore(0);
      onResetRound();
    }
  }, [resetRoundFlag, onResetRound, roomThemes]);

  useEffect(() => {
    const handleRoundEnded = () => {
      console.log("🔔 Evento round_ended recebido — enviando respostas...");
      if (roundStarted) {
        socket.emit("submit_answers", answersRef.current);
      }
    };

    const handleGameEnded = (ranking) => {
      console.log("🎉 game_ended recebido, ranking final:", ranking);
      setFinalRanking(ranking);
      setShowModal(true);
      setShowResults(false);
    };

    const handleStartValidation = ({ current, judgeId }) => {
      console.log("📨 start_validation recebido:", current, " | Juiz Socket ID:", judgeId);
      setShowModal(true);
      setValidationData(current);
      setCanReveal(socket.id === judgeId);
      setRevealed(false); // Garante que a resposta não esteja revelada ao iniciar
      setCurrentAnswerValidatedInModal(false); // Garante que a resposta não esteja validada ao iniciar
      setShowResults(false);
      setTotalPoints(null);
    };

    const handleRevealAnswer = () => {
        setRevealed(true);
        // Quando a resposta é revelada, se ela JÁ VIER validada do backend (cenário improvável mas possível),
        // já marcamos como validada na modal.
        if (validationData?.validated) {
            setCurrentAnswerValidatedInModal(true);
        }
    };

    const handleAnswerValidated = ({ current }) => {
      console.log("✅ answer_validated recebido:", current);
      setAnswers((prevAnswers) =>
        prevAnswers.map((a, i) =>
          i === current.themeIndex ? { ...a, points: current.points, validated: current.validated } : a
        )
      );
      // Atualiza validationData para renderizar os pontos na modal
      setValidationData(current);
      // NOVO: Marca que a resposta atual na modal foi validada
      setCurrentAnswerValidatedInModal(true);
      // NÃO resetamos 'revealed' aqui, para que a resposta e os pontos continuem visíveis.
      // A próxima chamada de 'start_validation' ou 'next_validation' irá resetar 'revealed' para a próxima resposta.
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

      setShowModal(false);
      setValidationData(null);
      setCurrentAnswerValidatedInModal(false); // Resetar este estado ao fechar a modal
      setShowResults(true);
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
  }, [userId, roundStarted, answers, validationData]); // Adicionei validationData como dependência para handleRevealAnswer

  const handleAnswerInputChange = (index, value) => {
    const newAnswers = [...answers];
    newAnswers[index].answer = value;
    setAnswers(newAnswers);
  };

  const handleAddTheme = () => {
    const trimmedTheme = newThemeInput.trim();
    if (trimmedTheme && !roomThemes.includes(trimmedTheme) && roomThemes.length < maxThemes) {
      const updatedThemes = [...roomThemes, trimmedTheme];
      setRoomThemes(updatedThemes);
      setNewThemeInput("");
    }
  };

  const handleRemoveTheme = (themeToRemove) => {
    if (roomThemes.length > 1) {
      const updatedThemes = roomThemes.filter((theme) => theme !== themeToRemove);
      setRoomThemes(updatedThemes);
    }
  };

  const handleNewRound = () => {
    socket.emit("reset_round_data");
  };

  const handleEndGame = () => socket.emit("end_game");
  const handleReveal = () => socket.emit("reveal_answer");
  const handleValidation = (isValid) => socket.emit("validate_answer", { valid: isValid });
  const handleNext = () => socket.emit("next_validation");

  console.log("GameBoard Render: ", { isAdmin, roundStarted, roundEnded, answersLength: answers.length, showModal, validationData, showResults, finalRanking, roomThemes, revealed, currentAnswerValidatedInModal });

  return (
    <div className="w-full h-full flex flex-col space-y-6">
      {/* ... (restante do seu código JSX, que não precisa de alterações) ... */}

      {letter && roundStarted && !roundEnded && (
        <div className="text-center text-3xl font-bold mb-4 text-blue-700 select-none">
          Letra da rodada: <span className="text-5xl">{letter}</span>
        </div>
      )}

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
                key={theme + index}
                className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
              >
                {theme}
                {roomThemes.length > 1 && (
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

      {!finalRanking && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-h-[450px] overflow-y-auto">
            {answers.map((answerItem, i) => (
              <div
                key={answerItem.theme + i}
                className="flex flex-col bg-gray-50 p-4 rounded shadow-sm min-w-[200px]"
              >
                <label className="block text-gray-700 font-medium mb-1 truncate" title={answerItem.theme}>
                  {answerItem.theme}
                </label>
                <input
                  type="text"
                  placeholder="Sua resposta"
                  value={answerItem.answer}
                  disabled={!roundStarted || roundEnded}
                  onChange={(e) => handleAnswerInputChange(i, e.target.value)}
                  className="mb-2 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                {showResults && answerItem.points !== null && (
                  <div className="text-sm text-right font-semibold"
                        style={{ color: answerItem.points > 0 ? '#10B981' : '#EF4444' }}>
                    Pontos: {answerItem.points}
                  </div>
                )}
              </div>
            ))}
          </div>

          {roundStarted && !roundEnded && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => socket.emit("submit_answers", answers)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 font-semibold w-full max-w-xs"
              >
                Submeter Respostas
              </button>
            </div>
          )}

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
              onClick={() => window.location.reload()}
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

            {/* Condição para exibir a resposta e os botões */}
            {(revealed || currentAnswerValidatedInModal) ? (
              <>
                <div className="text-center text-2xl text-gray-900 font-bold">
                  Resposta:{" "}
                  <span className="text-blue-600">{validationData.answer || "(Resposta vazia)"}</span>
                </div>

                {/* Exibe os pontos APENAS se a resposta já foi validada */}
                {validationData.validated && validationData.points !== null && (
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
                )}

                {/* Botões Validar/Anular visíveis SOMENTE se não foi validada E for o juiz */}
                {canReveal && !validationData.validated && (
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
                )}

                {/* Botão Próxima Resposta/Tema/Finalizar visível SOMENTE se foi validada E for o juiz */}
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
                        Próxima Resposta
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              // Se não foi revelado nem validado ainda (estado inicial)
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