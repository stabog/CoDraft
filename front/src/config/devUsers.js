export const DEV_USERS = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Анна' },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Борис' },
  { id: '11111111-1111-4111-8111-111111111103', name: 'Мария' },
]

export function findDevUser(userId) {
  return DEV_USERS.find((user) => user.id === userId)
}
