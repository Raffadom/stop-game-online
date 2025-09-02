describe('Home', () => {
const user_name = Cypress.env('USER_NAME')
const save_room = Cypress.env('SAVE_ROOM')  

    it('should access save room correctly', () => {
        cy.visit('/')
        cy.get('[placeholder="Seu Nickname"]').type(user_name)
        cy.get('[placeholder="Código da Sala (opcional)"]').type(save_room)
        cy.contains('Entrar ou Criar Sala').click()
        cy.contains('RAFFA001 (Admin)').should('be.visible')
        cy.contains('Famí001').should('be.visible')
        cy.contains('Sala Salva').should('be.visible')
        cy.get('.bg-blue-200').should('be.visible');
    })
})