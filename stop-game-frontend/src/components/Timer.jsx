import { useEffect, useState } from "react";

export default function Timer({ duration }) {
  const [time, setTime] = useState(duration);

  useEffect(() => {
    // Garante que o timer comece com a duração correta
    setTime(duration);

    const interval = setInterval(() => {
      setTime((prevTime) => {
        // Se o tempo chegou a 0 ou menos, limpa o intervalo
        if (prevTime <= 1) {
          clearInterval(interval);
          return 0; // Garante que o tempo final seja 0
        }
        return prevTime - 1;
      });
    }, 1000);

    // Função de limpeza: será chamada quando o componente for desmontado
    // ou quando as dependências do useEffect (duration) mudarem.
    return () => clearInterval(interval);
  }, [duration]); // O efeito é re-executado sempre que a 'duration' muda

  // Formatação para minutos e segundos (opcional, para durações maiores)
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const displayTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="text-center text-lg font-bold">
      Tempo restante:{" "}
      <span className={time <= 10 ? "text-red-600 animate-pulse" : "text-blue-600"}>
        {displayTime}
      </span>
    </div>
  );
}