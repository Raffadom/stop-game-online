#!/usr/bin/env node

// CI Server Wrapper - Always starts the server regardless of environment
console.log('🚀 CI: Forçando inicialização do servidor...');

// Import the main application
const backend = require('./index.js');
const { server } = backend;

const PORT = process.env.PORT || 3001;

// Check if server is already listening
if (server.listening) {
    console.log(`✅ CI: Servidor já está rodando na porta ${server.address()?.port}`);
} else {
    // Force start server for CI
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 CI: Servidor FORÇADO a rodar na porta ${PORT}`);
        console.log(`🔗 CI: Servidor disponível em http://localhost:${PORT}`);
        console.log(`📊 CI: Modo: ${process.env.NODE_ENV || 'development'}`);
    });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 CI: Recebido SIGTERM, encerrando servidor...');
    if (server.listening) {
        server.close(() => {
            console.log('✅ CI: Servidor encerrado graciosamente');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('🛑 CI: Recebido SIGINT, encerrando servidor...');
    if (server.listening) {
        server.close(() => {
            console.log('✅ CI: Servidor encerrado graciosamente');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});