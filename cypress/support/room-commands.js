// Comandos específicos para testes do Room
Cypress.Commands.add('joinRoom', (roomCode, userName) => {
  cy.visit('/');
  cy.get('[data-testid="nickname-input"]')
    .clear()
    .type(userName);
  
  if (roomCode) {
    cy.get('[data-testid="room-code-input"]')
      .clear()
      .type(roomCode);
  }
  
  cy.get('[data-testid="join-create-room-btn"]').click();
  cy.get('[data-testid="room-container"]', { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('addTheme', (themeName) => {
  cy.get('[data-testid="add-theme-input"]')
    .clear()
    .type(themeName);
  
  cy.get('[data-testid="add-theme-btn"]').click();
  
  cy.get('[data-testid="themes-list"]')
    .should('contain.text', themeName);
});

Cypress.Commands.add('removeTheme', (themeName) => {
  cy.get('[data-testid="theme-item"]')
    .contains(themeName)
    .parent()
    .find('[data-testid="remove-theme-btn"]')
    .click();
  
  cy.get('[data-testid="themes-list"]')
    .should('not.contain.text', themeName);
});

Cypress.Commands.add('configureRoom', (settings) => {
  cy.get('[data-testid="room-settings-btn"]').click();
  
  if (settings.timer) {
    cy.get('[data-testid="timer-input"]')
      .clear()
      .type(settings.timer.toString());
  }
  
  if (settings.maxPlayers) {
    cy.get('[data-testid="max-players-input"]')
      .clear()
      .type(settings.maxPlayers.toString());
  }
  
  cy.get('[data-testid="save-settings-btn"]').click();
});

Cypress.Commands.add('startRoundWithValidation', () => {
  cy.get('[data-testid="start-round-btn"]').click();
  
  cy.get('[data-testid="countdown-display"]', { timeout: 5000 })
    .should('be.visible');
  
  cy.get('[data-testid="game-letter"]', { timeout: 10000 })
    .should('be.visible')
    .invoke('text')
    .should('match', /^[A-Z]$/);
});

Cypress.Commands.add('completeRound', (answers = []) => {
  cy.startRoundWithValidation();
  
  if (answers.length > 0) {
    cy.fillAnswers(answers);
  }
  
  cy.stopRound();
  
  // Auto-validar todas as respostas como válidas
  const validations = new Array(9).fill(true);
  cy.validateAnswers(validations);
});

Cypress.Commands.add('checkRoomPerformance', () => {
  cy.window().then((win) => {
    const navigationTiming = win.performance.getEntriesByType('navigation')[0];
    expect(navigationTiming.loadEventEnd - navigationTiming.fetchStart).to.be.lessThan(5000);
  });
});

Cypress.Commands.add('simulateNetworkError', () => {
  cy.intercept('GET', '**/socket.io/**', { statusCode: 500 }).as('networkError');
  cy.intercept('POST', '**/api/**', { statusCode: 500 }).as('apiError');
});

Cypress.Commands.add('waitForValidationComplete', () => {
  cy.get('[data-testid="validation-modal"]', { timeout: 5000 })
    .should('be.visible');
  
  // Aguardar até que a validação complete
  cy.get('[data-testid="round-results"]', { timeout: 30000 })
    .should('be.visible');
});

Cypress.Commands.add('verifyRoomState', (expectedState) => {
  if (expectedState.playerCount) {
    cy.get('[data-testid="player-count"]')
      .should('contain.text', expectedState.playerCount.toString());
  }
  
  if (expectedState.roomCode) {
    cy.get('[data-testid="room-code-display"]')
      .should('contain.text', expectedState.roomCode);
  }
  
  if (expectedState.isAdmin !== undefined) {
    if (expectedState.isAdmin) {
      cy.get('[data-testid="admin-controls"]').should('be.visible');
    } else {
      cy.get('[data-testid="admin-controls"]').should('not.exist');
    }
  }
});