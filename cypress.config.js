const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "https://stop-paper.netlify.app",
    setupNodeEvents(on, config) {
      // Configurações por ambiente
      const environment = config.env.environment || process.env.NODE_ENV || 'production';
      
      // Configurações específicas por ambiente
      switch (environment) {
        case 'ci':
          config.baseUrl = "http://localhost:4173";
          config.video = true;
          config.screenshotOnRunFailure = true;
          config.retries.runMode = 3;
          break;
        case 'local':
          config.baseUrl = "http://localhost:5173";
          config.video = false;
          config.screenshotOnRunFailure = false;
          config.retries.runMode = 1;
          break;
        case 'staging':
          config.baseUrl = "https://stop-paper-staging.netlify.app";
          config.video = true;
          config.retries.runMode = 2;
          break;
        default: // production
          config.baseUrl = "https://stop-paper.netlify.app";
          config.video = false;
          config.retries.runMode = 2;
      }

      // Listeners de eventos
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        }
      });

      // Plugin para gerar relatórios
      on('after:run', (results) => {
        if (results) {
          console.log('📊 Test Results Summary:');
          console.log(`Total Tests: ${results.totalTests}`);
          console.log(`Passed: ${results.totalPassed}`);
          console.log(`Failed: ${results.totalFailed}`);
          console.log(`Skipped: ${results.totalSkipped}`);
          console.log(`Duration: ${results.totalDuration}ms`);
        }
      });

      return config;
    },
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    pageLoadTimeout: 30000,
    
    // Configurações específicas para testes
    retries: {
      runMode: 2,
      openMode: 0
    },
    
    // Especificar padrões de arquivos de teste
    specPattern: [
      "cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}",
      "cypress/integration/**/*.{cy,spec}.{js,jsx,ts,tsx}"
    ],
    
    // Excluir arquivos
    excludeSpecPattern: [
      "**/examples/*",
      "**/*.hot-update.js"
    ],
    
    // Configurações de browser
    chromeWebSecurity: false,
    modifyObstructiveCode: false,
    
    // Experimentais
    experimentalStudio: true,
    experimentalSessionAndOrigin: true
  },
  
  // Configurações do component testing (futuro)
  component: {
    devServer: {
      framework: "react",
      bundler: "vite",
    },
    specPattern: "src/**/*.cy.{js,jsx,ts,tsx}"
  }
});
