#!/bin/bash
# Script específico para executar Cypress no CI

set -e  # Exit on any error

echo "🔧 Preparing Cypress for CI environment..."

# Verificar se o Cypress está instalado
echo "🔍 Checking Cypress installation..."
if ! npx cypress --version; then
    echo "❌ Cypress not found, installing..."
    npx cypress install --force
fi

# Verificar binário do Cypress
echo "✅ Verifying Cypress binary..."
npx cypress verify

# Aguardar servidores
echo "⏳ Waiting for servers to be ready..."
timeout 120 bash -c 'until curl -f http://localhost:3001 && curl -f http://localhost:4173; do sleep 2; done' || {
    echo "❌ Servers failed to start within timeout"
    exit 1
}

# Criar diretório de resultados se não existir
mkdir -p cypress/results

# Executar testes
echo "🧪 Running Cypress tests..."
DISPLAY=:99 npx cypress run \
    --browser chrome \
    --headless \
    --config baseUrl=http://localhost:4173 \
    --env environment=ci \
    --reporter json \
    --reporter-options output=cypress/results/results.json || {
    echo "❌ Cypress tests failed"
    exit 1
}

echo "✅ Cypress tests completed successfully!"