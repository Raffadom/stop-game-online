#!/bin/bash

echo "🚀 Iniciando servidor backend para CI..."

# Definir variáveis de ambiente
export NODE_ENV=ci
export PORT=3001

# Verificar se a porta está livre
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Porta 3001 já está em uso. Limpando..."
    pkill -f "node.*index.js" || true
    sleep 2
fi

echo "📍 Iniciando na porta $PORT com NODE_ENV=$NODE_ENV"

# Iniciar servidor
node index.js &
SERVER_PID=$!

echo "🆔 Servidor iniciado com PID: $SERVER_PID"

# Aguardar inicialização
echo "⏰ Aguardando servidor inicializar..."
sleep 5

# Verificar se o processo está rodando
if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Processo do servidor está rodando"
else
    echo "❌ Processo do servidor falhou"
    exit 1
fi

# Verificar se a porta está listening
for i in {1..12}; do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        echo "✅ Servidor respondendo na porta 3001"
        exit 0
    fi
    echo "⏳ Tentativa $i/12 - aguardando servidor..."
    sleep 5
done

echo "❌ Servidor não respondeu após 60 segundos"
echo "🔍 Debug info:"
netstat -tuln | grep :3001 || echo "Porta 3001 não está listening"
ps aux | grep node | head -5

exit 1