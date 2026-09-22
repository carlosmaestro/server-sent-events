import { Injectable, signal, computed } from '@angular/core';
import { ChatMessagePayload, ClientStatus } from '@sse-showcase/shared-types';

export interface AuthResponse {
  token: string;
  clientId: string;
  clientName: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

@Injectable({
  providedIn: 'root'
})
export class SseService {
  private readonly API_AUTH_URL = 'http://localhost:3001';
  private readonly API_SSE_URL = 'http://localhost:3002';

  private eventSource: EventSource | null = null;

  // Signals para reatividade pura
  readonly status = signal<ConnectionStatus>('disconnected');
  readonly currentUser = signal<AuthResponse | null>(null);
  readonly messages = signal<ChatMessagePayload[]>([]);
  readonly error = signal<string | null>(null);

  readonly isConnected = computed(() => this.status() === 'connected');

  async connect(clientName: string): Promise<void> {
    if (this.status() !== 'disconnected') return;

    this.status.set('connecting');
    this.error.set(null);

    try {
      // 1. Obter Token da API 1
      const res = await fetch(`${this.API_AUTH_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName })
      });

      if (!res.ok) {
        throw new Error('Falha ao autenticar na API 1');
      }

      const authData: AuthResponse = await res.json();
      this.currentUser.set(authData);

      // 2. Conectar à API 2 via SSE nativo com Token na Query Param
      const sseUrl = `${this.API_SSE_URL}/sse/events?token=${encodeURIComponent(authData.token)}`;
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.addEventListener('connected', (event: MessageEvent) => {
        console.log('[SSE] Conectado com sucesso:', event.data);
        this.status.set('connected');
      });

      this.eventSource.addEventListener('message', (event: MessageEvent) => {
        try {
          const message: ChatMessagePayload = JSON.parse(event.data);
          this.messages.update((prev) => [message, ...prev]);
        } catch (err) {
          console.error('[SSE] Falha ao processar mensagem recebida:', err);
        }
      });

      this.eventSource.onerror = (err) => {
        console.error('[SSE] Erro na conexão:', err);
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.disconnect();
          this.error.set('Conexão encerrada pelo servidor ou falha de rede.');
        }
      };

    } catch (err: any) {
      console.error('[Client] Erro ao iniciar conexão:', err);
      this.error.set(err.message || 'Erro inesperado ao conectar');
      this.disconnect();
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.status.set('disconnected');
    this.currentUser.set(null);
  }

  clearMessages(): void {
    this.messages.set([]);
  }
}
