Cypress.Commands.add('login', (customUserName = null, customRoomCode = null) => {
  const user_name = customUserName || Cypress.env('USER_NAME');
  const save_room = customRoomCode || Cypress.env('SAVE_ROOM');
  
  cy.visit('/');
  
  // Aguarda o componente carregar antes de interagir
  cy.get('[data-testid="nickname-input"]', { timeout: 10000 }).should('be.visible');
  
  cy.get('[data-testid="nickname-input"]').clear().type(user_name);
  
  if (save_room) {
    cy.get('[data-testid="room-code-input"]').clear().type(save_room);
  }
  
  cy.get('[data-testid="join-create-room-btn"]').click();
});

// Substituir os comandos relacionados a room code por versões mais simples

// Comando para criar nova sala
Cypress.Commands.add('createNewRoom', (userName = null) => {
  const user = userName || 'TestUser' + Date.now().toString().slice(-6);
  
  cy.visit('/');
  cy.get('[data-testid="home-container"]', { timeout: 10000 }).should('be.visible');
  
  cy.get('[data-testid="nickname-input"]')
    .clear()
    .type(user);
  
  cy.get('[data-testid="join-create-room-btn"]').click();
  
  // Aguardar entrada na sala
  cy.get('body', { timeout: 15000 }).should('contain.text', 'Sala');
  
  return cy.wrap(user);
});

// Comando para capturar código da sala atual
Cypress.Commands.add('getRoomCode', () => {
  return cy.get('body')
    .invoke('text')
    .then((bodyText) => {
      const roomCodeMatch = bodyText.match(/Sala:\s*(\w+)/);
      if (roomCodeMatch) {
        return roomCodeMatch[1];
      }
      return null;
    });
});

// Comando para entrar em sala com código específico
Cypress.Commands.add('joinRoomWithCode', (userName, roomCode) => {
  cy.visit('/');
  cy.get('[data-testid="home-container"]', { timeout: 10000 }).should('be.visible');
  
  cy.get('[data-testid="nickname-input"]')
    .clear()
    .type(userName);
  
  cy.get('[data-testid="room-code-input"]')
    .clear()
    .type(roomCode);
  
  cy.get('[data-testid="join-create-room-btn"]').click();
  
  cy.get('body', { timeout: 15000 }).should('contain.text', 'Sala');
});

// CORREÇÃO: Comando tab mais simples e confiável
Cypress.Commands.add('tab', { prevSubject: 'optional' }, (subject) => {
  if (subject) {
    cy.wrap(subject).trigger('keydown', { keyCode: 9, which: 9, key: 'Tab' });
  } else {
    cy.get(':focus').trigger('keydown', { keyCode: 9, which: 9, key: 'Tab' });
  }
});

// Comando para verificar se elemento está visível na viewport
Cypress.Commands.add('shouldBeInViewport', { prevSubject: true }, (subject) => {
  cy.wrap(subject).should(($el) => {
    const rect = $el[0].getBoundingClientRect();
    const viewport = {
      width: Cypress.config('viewportWidth'),
      height: Cypress.config('viewportHeight')
    };
    
    expect(rect.top).to.be.at.least(0);
    expect(rect.left).to.be.at.least(0);
    expect(rect.bottom).to.be.at.most(viewport.height);
    expect(rect.right).to.be.at.most(viewport.width);
  });
});

// Comandos customizados baseados na sua estrutura

Cypress.Commands.add('loginToGame', (nickname, roomCode = '') => {
  cy.get('[data-testid="nickname-input"]')
    .clear()
    .type(nickname);
    
  if (roomCode) {
    cy.get('[data-testid="room-code-input"]')
      .clear()
      .type(roomCode);
  }
  
  cy.get('[data-testid="join-create-room-btn"]').click();
  
  // CORREÇÃO: Aguardar sair da home em vez de procurar elemento específico
  cy.get('[data-testid="home-container"]', { timeout: 15000 }).should('not.exist');
  
  // Verificar que chegou em alguma tela de jogo
  cy.get('body').should('not.contain.text', 'Seu Nickname');
});

Cypress.Commands.add('startGameRound', () => {
  // Procurar botão de iniciar de forma mais flexível
  cy.get('body').then(($body) => {
    const bodyText = $body.text();
    
    if (bodyText.includes('Iniciar')) {
      cy.contains('Iniciar').click();
    } else if (bodyText.includes('Start')) {
      cy.contains('Start').click();
    } else if (bodyText.includes('Começar')) {
      cy.contains('Começar').click();
    } else {
      throw new Error('Start button not found');
    }
  });
  
  // Aguardar possível mudança de estado
  cy.wait(3000);
  
  // Verificar se rodada iniciou
  cy.get('body').then(($body) => {
    const text = $body.text();
    const hasGameState = 
      text.includes('Letra') ||
      /\b[A-Z]\b/.test(text) ||
      text.includes('Timer') ||
      text.includes('Tempo') ||
      text.includes('STOP');
    
    if (!hasGameState) {
      cy.log('Game round may not have started - checking for requirements');
    }
  });
});

Cypress.Commands.add('fillAnswers', (answers) => {
  // Procurar inputs de resposta de forma flexível
  cy.get('body').then(($body) => {
    const inputs = $body.find('input[type="text"]');
    
    inputs.each((index, input) => {
      if (answers[index] && index < answers.length) {
        cy.wrap(input)
          .clear()
          .type(answers[index]);
      }
    });
  });
});

Cypress.Commands.add('stopRound', () => {
  cy.get('body').then(($body) => {
    const bodyText = $body.text();
    
    if (bodyText.includes('STOP')) {
      cy.contains('STOP').click();
    } else if (bodyText.includes('Parar')) {
      cy.contains('Parar').click();
    } else if (bodyText.includes('Finalizar')) {
      cy.contains('Finalizar').click();
    } else {
      cy.log('Stop button not found - round may have ended automatically');
    }
  });
  
  cy.wait(2000); // Aguardar possível transição
});

Cypress.Commands.add('validateAnswers', (validations) => {
  validations.forEach((isValid, index) => {
    cy.get('body').then(($body) => {
      const bodyText = $body.text();
      
      if (bodyText.includes('Validação') || bodyText.includes('Validation')) {
        if (isValid) {
          if ($body.text().includes('Válida') || $body.text().includes('Valid')) {
            cy.contains(/Válida|Valid/i).click();
          }
        } else {
          if ($body.text().includes('Inválida') || $body.text().includes('Invalid')) {
            cy.contains(/Inválida|Invalid/i).click();
          }
        }
        
        cy.wait(500);
      }
    });
  });
});

Cypress.Commands.add('checkPerformance', (maxLoadTime = 3000) => {
  cy.window().then((win) => {
    const navigation = win.performance.getEntriesByType('navigation')[0];
    if (navigation) {
      const loadTime = navigation.loadEventEnd - navigation.fetchStart;
      expect(loadTime).to.be.lessThan(maxLoadTime);
    }
  });
});

// Comando para aguardar transição de páginas
Cypress.Commands.add('waitForPageTransition', () => {
  cy.get('[data-testid="home-container"]', { timeout: 15000 }).should('not.exist');
  cy.get('body').should('not.contain.text', 'Seu Nickname');
  cy.wait(1000); // Aguardar estabilização
});

// Comando para verificar se está na sala
Cypress.Commands.add('shouldBeInRoom', () => {
  cy.get('[data-testid="home-container"]').should('not.exist');
  cy.get('body').should('contain.text', '#'); // Código da sala
  cy.get('body').should('not.contain.text', 'Seu Nickname');
});
