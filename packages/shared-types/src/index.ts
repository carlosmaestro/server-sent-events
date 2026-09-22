/**
 * Payload contido no Token JWT do cliente
 */
export interface ClientTokenPayload {
  clientId: string;
  clientName: string;
  role: 'client' | 'admin';
  iat?: number;
  exp?: number;
}

/**
 * Informações cadastrais e de estado do cliente
 */
export interface ClientStatus {
  clientId: string;
  clientName: string;
  connectedAt: string;
  ip?: string;
}

/**
 * Formato padrão para mensagens enviadas aos clientes
 */
export interface ChatMessagePayload {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  targetClientId?: string; // se ausente, mensagem é broadcast
}

/**
 * Notificações do ciclo de vida dos clientes transmitidas para o painel Admin
 */
export interface AdminNotificationPayload {
  type: 'client:connected' | 'client:disconnected';
  client: ClientStatus;
  timestamp: string;
}

/**
 * Estrutura genérica de um evento SSE
 */
export interface SseEvent<T = unknown> {
  event?: string;
  id?: string;
  retry?: number;
  data: T;
}

/**
 * Constantes de Canais Pub/Sub do Redis
 */
export const REDIS_CHANNELS = {
  BROADCAST: 'events:broadcast',
  ADMIN_EVENTS: 'events:admin',
  clientChannel: (clientId: string) => `events:client:${clientId}`
} as const;

/**
 * Constantes de Chaves do Redis (Sets e Hashes de estado)
 */
export const REDIS_KEYS = {
  ACTIVE_CLIENTS_SET: 'active_clients:set',
  CLIENT_DETAILS_HASH: 'active_clients:details'
} as const;
