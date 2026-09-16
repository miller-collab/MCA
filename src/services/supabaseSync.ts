/**
 * SERVIÇO DE SINCRONIZAÇÃO MCA (OPÇÃO 1: BANCO DE DADOS NATIVO DO SERVIDOR)
 * Redirecionado para nativeDatabaseSync.ts:
 * - 100% livre de cadastros externos
 * - Fila offline para redes de internet instáveis ou quedas de Wi-Fi
 * - Sincronização em tempo real nativa via Server-Sent Events (SSE)
 */

export * from './nativeDatabaseSync';
export { default } from './nativeDatabaseSync';
