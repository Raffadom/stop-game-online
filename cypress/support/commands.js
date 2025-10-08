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

// Comando para criar nova sala
Cypress.Commands.add('createNewRoom', (userName = null) => {
  const user_name = userName || Cypress.env('NEW_USER_NAME') || 'NewUser' + Date.now();
  
  cy.visit('/');
  cy.get('[data-testid="nickname-input"]', { timeout: 10000 }).should('be.visible');
  
  cy.get('[data-testid="nickname-input"]').clear().type(user_name);
  // Não preenche room code para criar nova sala
  cy.get('[data-testid="join-create-room-btn"]').click();
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
